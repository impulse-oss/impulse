import * as t from '@babel/types'
import animatedScrollTo from 'animated-scroll-to'
import {
  Action,
  KBarAnimator,
  KBarContext,
  KBarPortal,
  KBarPositioner,
  KBarProvider,
  KBarResults,
  KBarSearch,
  useKBar,
  useMatches,
  useRegisterActions,
  VisualState,
} from 'kbar'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  isNotEmptyNode,
  JSXNode,
  transformNodeInCode,
  writeTransformationResultToFile,
} from './ast'
import { ClassEditor, useClassEditor } from './class-editor'
import {
  elementGetAbsolutePosition,
  observeNode,
  waitForAnyNodeMutation,
} from './dom'
import { normalizePath, useDirHandle } from './fs'
import { warn } from './logger'
import { ElementNavbar } from './navbar'
import {
  elementGetOwnerWithSource,
  Fiber,
  FiberSource,
  getReactFiber,
  nodeIsComponentRoot,
} from './react-source'
import { TailwindClasses, useTailwind } from './tailwind'
import { makeTransformers } from './transformers'
import { undoLatestChange } from './undo'
import { useAtomGetter } from './useAtomGetter'

declare global {
  interface Window {
    $__i?: {
      e: Node
      f?: Fiber | null
    }
  }
  interface Node {
    __impulseHide?: boolean
    __impulseDirty?: boolean
  }
}

export function ImpulseRoot(props: ImpulseParams) {
  return (
    <div
      id="impulse-root"
      className="impulse-styles theme-solarized-light"
      style={{
        // prevent the styles outside of root from being applied
        all: 'initial',
        position: 'absolute',
        top: 0,
        left: 0,
      }}
    >
      <style>{`
      .theme-solarized-light {
        --theme-color-base03: 0 43 54;
        --theme-color-base02: 7 54 66;
        --theme-color-base01: 88 110 117;
        --theme-color-base00: 101 123 131;
        --theme-color-base0: 131 148 150;
        --theme-color-base1: 147 161 161;
        --theme-color-base2: 238 232 213;
        --theme-color-base3: 253 246 227;
        --theme-color-yellow: 223 202 136;
        --theme-color-orange: 203 45 0;
        --theme-color-red: 220 50 50;
        --theme-color-magenta: 211 47 47;
        --theme-color-violet: 108 113 117;
        --theme-color-blue: 38 139 210;
        --theme-color-cyan: 42 161 152;
        --theme-color-green: 133 153 0;
      }
      `}</style>
      <KBarProvider
        options={{
          disableScrollbarManagement: true,
          toggleShortcut: 'none! it is handled by our code',
        }}
      >
        <ImpulseApp {...props} />
        <KBarPortal>
          <KBarPositioner
            className="impulse-styles theme-solarized-light"
            style={{ zIndex: 10200 }}
          >
            <div className="w-full max-w-xl overflow-hidden text-theme-base01 bg-theme-base3 text-base shadow-lg border">
              <div className="px-2 pt-2 font-sans">
                <KBarSearch
                  className="w-full box-border outline-0 m-0 bg-theme-base2 border border-theme-yellow outline-none text-theme-base01 px-1 py-px selection:bg-theme-yellow/50"
                  defaultPlaceholder="Start typing..."
                />
              </div>
              <CommandBarResults />
            </div>
          </KBarPositioner>
        </KBarPortal>
      </KBarProvider>
    </div>
  )
}

const ImpulseAppContext = createContext<{
  selectedElement: Element | null
  __rerenderValue: number
  rerender: () => void
}>({ __rerenderValue: 0, selectedElement: null, rerender: () => {} })

export type SelectionState =
  | {
      type: 'elementSelected'
      selectedNode: Node
      parentElement: Element
      indexInsideParent: number
    }
  | {
      type: 'elementNotSelected'
    }

export type ImpulseParams = {
  prettierConfig?: any
  tailwindConfig?: any
  config?: {}
}

function ImpulseApp(props: ImpulseParams) {
  const [selectionState, setSelectionState] = useState<SelectionState>({
    type: 'elementNotSelected',
  })

  const setSelectedNode = (
    selectedElement: Node,
    parameters?: { indexInsideParent?: number },
  ) => {
    const parentElement = selectedElement.parentElement
    if (!parentElement) {
      return setSelectionState({ type: 'elementNotSelected' })
    }

    const siblings = Array.from(parentElement.childNodes) as Node[]
    const indexInsideParent =
      parameters?.indexInsideParent ?? siblings.indexOf(selectedElement)

    setSelectionState({
      type: 'elementSelected',
      selectedNode: selectedElement,
      parentElement: parentElement,
      indexInsideParent,
    })

    window.$__i = { e: selectedElement, f: getReactFiber(selectedElement) }
  }

  const removeElementSelection = () => {
    setSelectionState({ type: 'elementNotSelected' })
  }

  const onSelectedElementRemoved = () => {
    if (selectionState.type !== 'elementSelected') {
      return
    }

    const { parentElement, indexInsideParent } = selectionState
    const children = [...parentElement.childNodes]

    const siblingSameSpot = children[indexInsideParent] as Element | undefined
    const siblingBefore = children[indexInsideParent - 1] as Element | undefined
    const siblingAfter = children[indexInsideParent + 1] as Element | undefined

    const selectOrExit: typeof setSelectedNode = (node, parameters) => {
      if (document.body.contains(node)) {
        return setSelectedNode(node, parameters)
      }

      return removeElementSelection()
    }

    if (siblingSameSpot && !siblingSameSpot.__impulseHide) {
      selectOrExit(siblingSameSpot)
      return
    }

    if (siblingBefore) {
      selectOrExit(siblingBefore)
      return
    }

    if (siblingAfter) {
      selectOrExit(siblingAfter, {
        indexInsideParent: indexInsideParent - 1,
      })
      return
    }

    selectOrExit(parentElement)
  }

  const { query: kbarQuery } = useKBar()

  const navbarRef = useRef<HTMLDivElement>(null)
  const originalBodyPaddingBottom = useRef('')

  useEffect(() => {
    if (selectionState.type === 'elementSelected' && navbarRef.current) {
      originalBodyPaddingBottom.current = window.getComputedStyle(
        document.body,
      ).paddingBottom
      document.body.style.paddingBottom = `${navbarRef.current.offsetHeight}px`
      return
    }

    document.body.style.paddingBottom = originalBodyPaddingBottom.current
  }, [selectionState.type])

  useEffect(() => {
    if (selectionState.type !== 'elementSelected') {
      return
    }

    const { observer, parentObserver } = observeNode(
      selectionState.selectedNode,
      (records) => {
        // some of our code adds temporary classes and it's not a good case to rerender
        if (
          records.every((record) => {
            return (
              record.type === 'attributes' &&
              record.attributeName === 'class' &&
              record.target instanceof Element &&
              [...record.target.classList].find((cl) =>
                cl.startsWith('__impulse__'),
              )
            )
          })
        ) {
          return
        }
        onSelectedElementRemoved()
        rerender()
      },
    )

    const interval = setInterval(() => {
      if (
        selectionState.selectedNode &&
        !document.body.contains(selectionState.selectedNode)
      ) {
        warn('selected element is no longer mounted on the page')
        onSelectedElementRemoved()
        rerender()
      }
    }, 1000)

    return () => {
      clearInterval(interval)
      observer.disconnect()
      if (parentObserver) {
        parentObserver.disconnect()
      }
    }
  }, [selectionState])

  const [__rerenderValue, __setRerenderValue] = useState(0)
  const rerender = () => __setRerenderValue(Math.random())

  const kbarContext = useContext(KBarContext)
  const { getDirHandle, FsAccessWarningAlert, alertIsOpen } = useDirHandle()

  const { tailwindClasses } = useTailwind({
    tailwindConfig: {
      content: [],
      theme: props.tailwindConfig?.theme ?? undefined,
    },
  })

  const classEditor = useClassEditor()

  // click
  useEffect(() => {
    const elementOnClick = (event: MouseEvent) => {
      const elementUnderCursor = event.target as Node
      const parentElement = elementUnderCursor.parentElement

      if (!parentElement) {
        return
      }

      if (
        parentElement.id === 'impulse-root' ||
        parentElement.closest('#impulse-root')
      ) {
        return
      }

      if (!event.altKey) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      setSelectedNode(elementUnderCursor)

      if (elementUnderCursor instanceof HTMLElement) {
        elementUnderCursor.blur()
      }
    }

    document.addEventListener('click', elementOnClick, { capture: true })

    return () => {
      document.removeEventListener('click', elementOnClick, { capture: true })
    }
  }, [])

  const classEditorStateGetter = useAtomGetter(classEditor.stateAtom)

  // keyboard
  useEffect(() => {
    const documentOnKeyDown = (event: KeyboardEvent) => {
      if (selectionState.type !== 'elementSelected') {
        return
      }

      if (kbarContext.getState().visualState === VisualState.showing) {
        return
      }

      if (alertIsOpen) {
        return
      }

      const classEditorState = classEditorStateGetter()
      if (classEditorState.type === 'active') {
        return
      }

      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return
      }

      const arrowsMap = {
        ArrowLeft: () => {
          const parent = selectionState.parentElement
          if (!parent) {
            return
          }
          setSelectedNode(parent)
        },
        ArrowUp: () => {
          const previousNode = selectionState.selectedNode.previousSibling

          if (!previousNode) {
            return
          }

          setSelectedNode(previousNode)
        },
        ArrowDown: () => {
          const nextNode = selectionState.selectedNode.nextSibling

          if (!nextNode) {
            return
          }

          setSelectedNode(nextNode)
        },
        ArrowRight: () => {
          const firstChild = selectionState.selectedNode.firstChild

          if (!firstChild) {
            return
          }
          setSelectedNode(firstChild)
        },
        Escape: () => {
          if (selectionState.type === 'elementSelected') {
            removeElementSelection()
            return true
          }
          return false
        },
      }

      const homerowMap = {
        KeyH: arrowsMap.ArrowLeft,
        KeyJ: arrowsMap.ArrowDown,
        KeyK: arrowsMap.ArrowUp,
        KeyL: arrowsMap.ArrowRight,
      }

      const actionsMap = {
        ...arrowsMap,
        ...homerowMap,
        Space: () => {
          kbarQuery.toggle()
        },
        Enter: () => {
          kbarQuery.toggle()
        },
      }

      const action = actionsMap[event.code as keyof typeof actionsMap]
      if (!action) {
        return
      }

      const shouldPrevent = action() ?? true

      if (shouldPrevent) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    document.addEventListener('keydown', documentOnKeyDown, { capture: true })

    return () => {
      document.removeEventListener('keydown', documentOnKeyDown, {
        capture: true,
      })
    }
  }, [selectionState, alertIsOpen])

  useEffect(() => {
    if (selectionState.type !== 'elementSelected') {
      return
    }

    if (!(selectionState.selectedNode instanceof Element)) {
      return
    }

    animatedScrollTo(selectionState.selectedNode, {
      verticalOffset: -150,
    })
  }, [selectionState])

  useEffect(() => {
    ;(window as any).$_impulseTest = async (rootNode: Node) => {
      if (rootNode instanceof Element && rootNode.id === 'impulse-root') {
        return
      }

      const transformResult = await transformNodeInCode(
        rootNode,
        (path) => {
          return path.node
        },
        await getDirHandle({ mode: 'read' }),
        { prettierConfig: props.prettierConfig },
      )

      if (transformResult.type === 'error') {
        console.log('Running test for', rootNode, 'error')
      }

      if (
        transformResult.type === 'success' &&
        !transformResult.visitorResult
      ) {
        console.log('Running test for', rootNode, 'no result')
      }

      if (
        transformResult.type === 'success' &&
        transformResult.visitorResult &&
        !(rootNode instanceof Element)
      ) {
        // console.log('Running test for', rootNode, transformResult.visitorResult)
      }

      if (rootNode instanceof Element) {
        ;[...rootNode.childNodes].map((window as any).$_impulseTest)
      }
    }
  }, [])

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      rerender()
    })

    resizeObserver.observe(document.body)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  const transformers = makeTransformers({
    getDirHandle,
    selectionState,
    setSelectedNode,
    prettierConfig: props.prettierConfig,
  })

  return (
    <div>
      {selectionState.type === 'elementSelected' && (
        <>
          <SelectionBox selectedElement={selectionState.selectedNode} />
          {selectionState.selectedNode.parentElement && (
            <>
              {/* <SelectionBoxParent
                selectedElement={selectionState.selectedNode.parentElement}
              /> */}
              {Array.from(selectionState.selectedNode.parentElement.childNodes)
                .filter((element) => {
                  return element !== selectionState.selectedNode
                })
                .map((element, idx) => {
                  return (
                    <SelectionBoxSibling key={idx} selectedElement={element} />
                  )
                })}
            </>
          )}
          {Array.from(selectionState.selectedNode.childNodes).map(
            (child, idx) => (
              <SelectionBoxChild key={idx} selectedNode={child} />
            ),
          )}
          <ElementNavbar
            ref={navbarRef}
            selectedNode={selectionState.selectedNode}
            onNodeClick={setSelectedNode}
          />
        </>
      )}
      <CommandBarController
        prettierConfig={props.prettierConfig}
        {...{
          getDirHandle,
          selectionState,
          classEditor,
          tailwindClasses,
          transformers,
        }}
      />

      <ClassEditor
        selectedNode={
          selectionState.type === 'elementSelected'
            ? selectionState.selectedNode
            : undefined
        }
        {...classEditor}
        {...{
          tailwindClasses,
          transformers,
          rerender,
        }}
      />

      <FsAccessWarningAlert />
    </div>
  )
}

function CommandBarController(props: {
  prettierConfig?: any
  getDirHandle: ReturnType<typeof useDirHandle>['getDirHandle']
  selectionState: SelectionState
  classEditor: ReturnType<typeof useClassEditor>
  tailwindClasses: TailwindClasses
  transformers: ReturnType<typeof makeTransformers>
}) {
  const {
    getDirHandle,
    selectionState,
    classEditor,
    tailwindClasses,
    transformers,
  } = props

  const { searchQuery } = useKBar((state) => {
    return {
      searchQuery: state.searchQuery,
    }
  })

  const jumpToCode = async (selectedNode: Node) => {
    const fiber = getReactFiber(selectedNode)
    const source = fiber?._debugSource

    if (selectedNode instanceof Element && source) {
      const vscodeLink = makeVscodeLink(source)
      window.open(vscodeLink)
      return
    }

    const transformResult = await transformNodeInCode(
      selectedNode,
      (path) => {
        return path.node
      },
      await getDirHandle({ mode: 'read' }),
      { prettierConfig: props.prettierConfig },
    )

    if (transformResult.type === 'error') {
      return
    }

    const targetJsxNode = transformResult.visitorResult

    if (!targetJsxNode?.loc) {
      return
    }

    const loc =
      targetJsxNode.type === 'JSXElement'
        ? targetJsxNode.openingElement.loc?.start ?? targetJsxNode.loc.start
        : targetJsxNode.loc.end

    const vscodeLink = makeVscodeLink({
      fileName: transformResult.file.path,
      lineNumber: loc.line,
      columnNumber: loc.column + 1,
    })
    window.open(vscodeLink)

    return
  }

  const jumpToComponentCall = (selectedNode: Node) => {
    const source = (() => {
      if (selectedNode instanceof Element) {
        return elementGetOwnerWithSource(selectedNode)?._debugSource
      }

      if (selectedNode.parentElement) {
        return elementGetOwnerWithSource(selectedNode.parentElement)
          ?._debugSource
      }

      return null
    })()

    if (!source) {
      return
    }

    const vscodeLink = makeVscodeLink(source)
    window.open(vscodeLink)
    return
  }

  const {
    addClass,
    removeClass,
    removeNode,
    insertBeforeNode,
    insertAfterNode,
    insertChild,
    changeTag,
    moveNode,
    tryToUndoLatestChange,
  } = transformers

  const sections = {
    general: 'General',
    removeClass: 'Remove class',
    addClass: {
      name: 'Add class',
      priority: -10,
    },
    insertText: {
      name: 'Insert text',
      priority: -20,
    },
    changeTag: {
      name: 'Change tag',
      priority: -30,
    },
  }

  const actions: {
    [key: string]: Omit<Action, 'id'> & {
      showIf?: boolean
    }
  } = {
    jumpToCode: {
      showIf: selectionState.type === 'elementSelected',
      name: 'Jump to code',
      shortcut: ['KeyC'],
      keywords: 'jump code',
      section: sections.general,
      perform: () =>
        selectionState.type === 'elementSelected' &&
        jumpToCode(selectionState.selectedNode),
    },
    jumpToCodeCall: {
      showIf: selectionState.type === 'elementSelected',
      name: 'Jump to component call',
      shortcut: ['Shift+KeyC'],
      keywords: 'jump component call',
      section: sections.general,
      perform: () =>
        selectionState.type === 'elementSelected' &&
        jumpToComponentCall(selectionState.selectedNode),
    },
    removeElement: {
      showIf: selectionState.type === 'elementSelected',
      name: 'Remove element',
      shortcut: ['KeyD', 'KeyD'],
      section: sections.general,
      perform: () =>
        selectionState.type === 'elementSelected' &&
        window.confirm('Are use sure? This action is irreversible!') &&
        removeNode(selectionState.selectedNode),
    },
    moveUp: {
      showIf:
        selectionState.type === 'elementSelected' &&
        !!selectionState.selectedNode.previousSibling,
      name: 'Move up',
      shortcut: ['Shift+KeyK'],
      section: sections.general,
      perform: () =>
        selectionState.type === 'elementSelected' &&
        moveNode(selectionState.selectedNode, 'up'),
    },
    moveDown: {
      showIf:
        selectionState.type === 'elementSelected' &&
        !!selectionState.selectedNode.nextSibling,
      name: 'Move down',
      shortcut: ['Shift+KeyJ'],
      section: sections.general,
      perform: () =>
        selectionState.type === 'elementSelected' &&
        moveNode(selectionState.selectedNode, 'down'),
    },
    insertDivChild: {
      showIf:
        selectionState.type === 'elementSelected' &&
        selectionState.selectedNode instanceof Element,
      name: 'Insert child: <div>',
      shortcut: ['KeyI', 'KeyI'],
      section: sections.general,
      perform: () =>
        selectionState.type === 'elementSelected' &&
        insertChild(
          selectionState.selectedNode as Element,
          t.jsxElement(
            t.jsxOpeningElement(t.jsxIdentifier('div'), []),
            t.jsxClosingElement(t.jsxIdentifier('div')),
            [],
          ),
        ),
    },
    insertDivBefore: {
      showIf: selectionState.type === 'elementSelected',
      name: 'Insert before: <div>',
      shortcut: ['KeyI', 'KeyB'],
      section: sections.general,
      perform: () =>
        selectionState.type === 'elementSelected' &&
        insertBeforeNode(
          selectionState.selectedNode,
          t.jsxElement(
            t.jsxOpeningElement(t.jsxIdentifier('div'), []),
            t.jsxClosingElement(t.jsxIdentifier('div')),
            [],
          ),
        ),
    },
    insertDivAfter: {
      showIf: selectionState.type === 'elementSelected',
      name: 'Insert after: <div>',
      shortcut: ['KeyI', 'KeyA'],
      section: sections.general,
      perform: () =>
        selectionState.type === 'elementSelected' &&
        insertAfterNode(
          selectionState.selectedNode,
          t.jsxElement(
            t.jsxOpeningElement(t.jsxIdentifier('div'), []),
            t.jsxClosingElement(t.jsxIdentifier('div')),
            [],
          ),
        ),
    },
    ...(selectionState.type === 'elementSelected' &&
    selectionState.selectedNode instanceof Element
      ? Object.fromEntries(
          htmlTags
            .filter(
              (tagName) =>
                tagName !==
                (selectionState.selectedNode as Element).tagName.toLowerCase(),
            )
            .map((tagName) => [
              `changeTag-${tagName}`,
              {
                name: `<${tagName}>`,
                shortcut: [],
                section: sections.changeTag,
                perform: () =>
                  selectionState.type === 'elementSelected' &&
                  changeTag(selectionState.selectedNode as Element, tagName),
              },
            ]),
        )
      : {}),
    insertTextChild: {
      showIf:
        searchQuery !== '' &&
        selectionState.type === 'elementSelected' &&
        selectionState.selectedNode instanceof Element,
      section: sections.insertText,
      name: `Insert child: ${searchQuery}`,
      shortcut: [],
      perform: () => {
        if (selectionState.type !== 'elementSelected') {
          return
        }

        const htmlEntitiesRegex = /[\u00A0-\u9999<>\&]/g

        const nodeToInsert = htmlEntitiesRegex.test(searchQuery)
          ? t.jsxExpressionContainer(t.stringLiteral(searchQuery))
          : t.jsxText(searchQuery)

        insertChild(selectionState.selectedNode as Element, nodeToInsert)
      },
    },
    insertTextBefore: {
      showIf: selectionState.type === 'elementSelected' && searchQuery !== '',
      section: sections.insertText,
      name: `Insert before: ${searchQuery}`,
      shortcut: [],
      perform: () => {
        if (selectionState.type !== 'elementSelected') {
          return
        }

        const htmlEntitiesRegex = /[\u00A0-\u9999<>\&]/g

        const nodeToInsert = htmlEntitiesRegex.test(searchQuery)
          ? t.jsxExpressionContainer(t.stringLiteral(searchQuery))
          : t.jsxText(searchQuery)

        insertBeforeNode(selectionState.selectedNode as Element, nodeToInsert)
      },
    },
    insertTextAfter: {
      showIf: selectionState.type === 'elementSelected' && searchQuery !== '',
      section: sections.insertText,
      name: `Insert after: ${searchQuery}`,
      shortcut: [],
      perform: () => {
        if (selectionState.type !== 'elementSelected') {
          return
        }

        const htmlEntitiesRegex = /[\u00A0-\u9999<>\&]/g

        const nodeToInsert = htmlEntitiesRegex.test(searchQuery)
          ? t.jsxExpressionContainer(t.stringLiteral(searchQuery))
          : t.jsxText(searchQuery)

        insertAfterNode(selectionState.selectedNode as Element, nodeToInsert)
      },
    },
    undo: {
      showIf: true,
      section: sections.general,
      name: 'Undo',
      shortcut: ['$mod+KeyZ'],
      perform: () =>
        selectionState.type === 'elementSelected' && tryToUndoLatestChange(),
    },
    toggleClassEditor: {
      showIf:
        selectionState.type === 'elementSelected' &&
        selectionState.selectedNode instanceof Element,
      section: sections.general,
      name: 'Toggle class editor',
      shortcut: ['KeyE'],
      perform: () => {
        classEditor.toggle()
      },
    },
  }

  useRegisterActions(
    Object.entries(actions)
      .filter(([, action]) => action.showIf !== false)
      .map(([key, action]) => ({
        ...action,
        id: key,
      })),
    [actions],
  )

  return null
}

function CommandBarResults() {
  const { results } = useMatches()

  return (
    <KBarResults
      items={results}
      onRender={({ item, active }) =>
        typeof item === 'string' ? (
          <div className=" uppercase text-xs pt-2">
            <span className="flex items-center w-full h-6 px-2 bg-theme-base2">
              {item}
            </span>
          </div>
        ) : (
          <div
            className={`flex justify-between px-2 ${
              active ? 'bg-theme-yellow' : ''
            }`}
          >
            <div>{item.name}</div>
            <div className="flex gap-1 items-center">
              {item.shortcut &&
                item.shortcut.length > 0 &&
                item.shortcut.map((key, idxItem) => {
                  const isMac = navigator.platform
                    .toUpperCase()
                    .startsWith('MAC')

                  const keyElements = key.split('+')
                  const symbolReplaceMap: { [key: string]: string } = {
                    $mod: isMac ? '⌘' : '⌃',
                    Alt: '⌥',
                    Shift: '⇧',
                    Ctrl: '⌃',
                  }

                  return keyElements.map((keyElement, idx) => (
                    <span
                      key={keyElement + idxItem + idx}
                      className={`w-5 text-center uppercase font-mono bg-theme-base2/90 h-5 inline rounded-md ${
                        !!symbolReplaceMap[keyElement]
                          ? 'text-lg leading-5'
                          : 'text-xs py-1 leading-4'
                      }`}
                    >
                      {keyElement
                        .replace('Key', '')
                        .replace('Shift', '⇧')
                        .replace('$mod', isMac ? '⌘' : 'Ctrl')}
                    </span>
                  ))
                })}
            </div>
          </div>
        )
      }
    />
  )
}

function SelectionBox(props: { selectedElement: Node }) {
  const { selectedElement } = props
  const absolutePosition = elementGetAbsolutePosition(selectedElement)

  return (
    <div
      className="pointer-events-none absolute z-[10000]"
      style={{
        outline: '2px solid #0399FF',
        ...absolutePosition,
      }}
    ></div>
  )
}

function SelectionBoxParent(props: { selectedElement: Node }) {
  const { selectedElement } = props
  const absolutePosition = elementGetAbsolutePosition(selectedElement)

  return (
    <div
      className="pointer-events-none absolute bg-[#00ff0033]"
      style={{
        ...absolutePosition,
      }}
    ></div>
  )
}

function SelectionBoxSibling(props: { selectedElement: Node }) {
  const { selectedElement } = props
  const absolutePosition = elementGetAbsolutePosition(selectedElement)

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        outline: '1px solid #0399FF',
        ...absolutePosition,
      }}
    ></div>
  )
}

function SelectionBoxChild(props: { selectedNode: Node }) {
  const { selectedNode: selectedElement } = props
  const absolutePosition = elementGetAbsolutePosition(selectedElement)

  const adjustedPosition = {
    top: absolutePosition.top + 1,
    left: absolutePosition.left + 1,
    width: absolutePosition.width - 2,
    height: absolutePosition.height - 2,
  }

  return (
    <div
      className="pointer-events-none absolute border border-[#717171]"
      style={{
        ...adjustedPosition,
      }}
    ></div>
  )
}

function makeVscodeLink({ fileName, lineNumber, columnNumber }: FiberSource) {
  const fileNameNormalized = normalizePath(fileName)
  return `vscode://file${fileNameNormalized}:${lineNumber}:${columnNumber}`
}

const htmlTags = [
  'a',
  'abbr',
  'address',
  'area',
  'article',
  'aside',
  'audio',
  'b',
  'base',
  'bdi',
  'bdo',
  'blockquote',
  'body',
  'br',
  'button',
  'canvas',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'data',
  'datalist',
  'dd',
  'del',
  'details',
  'dfn',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'em',
  'embed',
  'fieldset',
  'figcaption',
  'figure',
  'font',
  'footer',
  'form',
  'frame',
  'frameset',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hgroup',
  'hr',
  'html',
  'i',
  'iframe',
  'img',
  'input',
  'ins',
  'kbd',
  'label',
  'legend',
  'li',
  'link',
  'main',
  'map',
  'mark',
  'marquee',
  'menu',
  'meta',
  'meter',
  'nav',
  'noscript',
  'object',
  'ol',
  'optgroup',
  'option',
  'output',
  'p',
  'param',
  'picture',
  'pre',
  'progress',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'script',
  'section',
  'select',
  'slot',
  'small',
  'source',
  'span',
  'strong',
  'style',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'template',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'time',
  'title',
  'tr',
  'track',
  'u',
  'ul',
  'var',
  'video',
  'wbr',
]
