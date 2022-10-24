import * as t from '@babel/types'
import animatedScrollTo from 'animated-scroll-to'
import {
  Action,
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
import { useContext, useEffect, useRef, useState } from 'react'
import { transformNodeInCode } from './ast'
import { ClassEditor, useClassEditor } from './class-editor'
import { elementGetAbsolutePosition, observeNode } from './dom'
import { normalizePath, useDirHandle } from './fs'
import { warn } from './logger'
import { NavTreePanel } from './nav-tree'
import {
  elementGetOwnerWithSource,
  Fiber,
  FiberSource,
  getReactFiber,
  nodeGetReactRoot,
} from './react-source'
import { TailwindClasses, useTailwind } from './tailwind'
import { makeTransformers } from './transformers'
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
        --theme-color-content: 88 110 117;
        --theme-color-content-opaque: 131 148 150;
        --theme-color-bg-highlight: 238 232 213;
        --theme-color-bg: 253 246 227;
        --theme-color-accent: 223 202 136;
        --theme-color-blue: 38 139 210;
        --theme-color-red: 220 50 47;
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
          <KBarPositioner className="impulse-styles theme-solarized-light" style={{ zIndex: 10200 }}>
            <div className="w-full max-w-xl overflow-hidden text-base border shadow-lg text-theme-content bg-theme-bg">
              <div className="px-2 pt-2 font-sans">
                <KBarSearch
                  className="w-full px-1 py-px m-0 border outline-none box-border outline-0 bg-theme-bg-highlight border-theme-accent selection:bg-theme-accent/50"
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
  config?: {
    editorLinkSchema?: string
    panel?: {
      height?: number
    }
  }
}

function ImpulseApp(props: ImpulseParams) {
  const [selectionState, setSelectionState] = useState<SelectionState>({
    type: 'elementNotSelected',
  })

  const setSelectedNode = (selectedElement: Node, parameters?: { indexInsideParent?: number }) => {
    const elementIsPartOfReactTree = !!nodeGetReactRoot(selectedElement)
    if (!elementIsPartOfReactTree) {
      return
    }

    const parentElement = selectedElement.parentElement
    if (!parentElement) {
      return setSelectionState({ type: 'elementNotSelected' })
    }

    const siblings = Array.from(parentElement.childNodes) as Node[]
    const indexInsideParent = parameters?.indexInsideParent ?? siblings.indexOf(selectedElement)

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

  const navtreeRef = useRef<HTMLDivElement>(null)
  const originalBodyPaddingBottom = useRef('')

  useEffect(() => {
    if (selectionState.type === 'elementSelected' && navtreeRef.current) {
      originalBodyPaddingBottom.current = window.getComputedStyle(document.body).paddingBottom
      document.body.style.paddingBottom = `${navtreeRef.current.offsetHeight}px`
      return
    }

    document.body.style.paddingBottom = originalBodyPaddingBottom.current
  }, [selectionState.type])

  useEffect(() => {
    if (selectionState.type !== 'elementSelected') {
      return
    }

    const { observer, parentObserver } = observeNode(selectionState.selectedNode, (records) => {
      // some of our code adds temporary classes and it's not a good case to rerender
      if (
        records.every((record) => {
          return (
            record.type === 'attributes' &&
            record.attributeName === 'class' &&
            record.target instanceof Element &&
            [...record.target.classList].find((cl) => cl.startsWith('__impulse__'))
          )
        })
      ) {
        return
      }
      onSelectedElementRemoved()
      rerender()
    })

    const interval = setInterval(() => {
      if (selectionState.selectedNode && !document.body.contains(selectionState.selectedNode)) {
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

      if (parentElement.id === 'impulse-root' || parentElement.closest('#impulse-root')) {
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
      if (classEditorState.type === 'active' && classEditorState.inputFocused) {
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

      if (transformResult.type === 'success' && !transformResult.visitorResult) {
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
    <div className="font-sans text-base selection:bg-theme-accent/50 text-theme-content">
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
                  return <SelectionBoxSibling key={idx} selectedElement={element} />
                })}
            </>
          )}
          {Array.from(selectionState.selectedNode.childNodes).map((child, idx) => (
            <SelectionBoxChild key={idx} selectedNode={child} />
          ))}
          <NavTreePanel
            height={props.config?.panel?.height ?? 350}
            rootRef={navtreeRef}
            selectedNode={selectionState.selectedNode}
            onNodeClick={(nodeFiber) => {
              if (nodeFiber instanceof Node) {
                setSelectedNode(nodeFiber)
                return
              }
              if (typeof nodeFiber.elementType !== 'string') {
                return
              }

              setSelectedNode(nodeFiber.stateNode!)
              return
            }}
            onCloseClick={() => {
              removeElementSelection()
            }}
            {...{
              tailwindClasses,
              transformers,
              rerender,
            }}
            sidePanel={
              <ClassEditor
                selectedNode={selectionState.selectedNode}
                {...classEditor}
                {...{
                  tailwindClasses,
                  transformers,
                  rerender,
                }}
              />
            }
          />
        </>
      )}
      <CommandBarController
        prettierConfig={props.prettierConfig}
        editorLinkSchema={props.config?.editorLinkSchema ?? 'vscode'}
        {...{
          getDirHandle,
          selectionState,
          classEditor,
          tailwindClasses,
          transformers,
        }}
      />

      <FsAccessWarningAlert />
    </div>
  )
}

function CommandBarController(props: {
  prettierConfig?: any
  editorLinkSchema: string
  getDirHandle: ReturnType<typeof useDirHandle>['getDirHandle']
  selectionState: SelectionState
  classEditor: ReturnType<typeof useClassEditor>
  tailwindClasses: TailwindClasses
  transformers: ReturnType<typeof makeTransformers>
}) {
  const { getDirHandle, selectionState, classEditor, transformers, editorLinkSchema } = props

  const { searchQuery } = useKBar((state) => {
    return {
      searchQuery: state.searchQuery,
    }
  })

  const jumpToCode = async (selectedNode: Node) => {
    const fiber = getReactFiber(selectedNode)
    const source = fiber?._debugSource

    if (selectedNode instanceof Element && source) {
      const vscodeLink = makeJumpToCodeLink(source, editorLinkSchema)
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

    const vscodeLink = makeJumpToCodeLink(
      {
        fileName: transformResult.file.path,
        lineNumber: loc.line,
        columnNumber: loc.column + 1,
      },
      editorLinkSchema,
    )
    window.open(vscodeLink)

    return
  }

  const jumpToComponentCall = (selectedNode: Node) => {
    const source = (() => {
      if (selectedNode instanceof Element) {
        return elementGetOwnerWithSource(selectedNode)?._debugSource
      }

      if (selectedNode.parentElement) {
        return elementGetOwnerWithSource(selectedNode.parentElement)?._debugSource
      }

      return null
    })()

    if (!source) {
      return
    }

    const vscodeLink = makeJumpToCodeLink(source, editorLinkSchema)
    window.open(vscodeLink)
    return
  }

  const {
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
      perform: () => selectionState.type === 'elementSelected' && jumpToCode(selectionState.selectedNode),
    },
    jumpToCodeCall: {
      showIf: selectionState.type === 'elementSelected',
      name: 'Jump to component call',
      shortcut: ['Shift+KeyC'],
      keywords: 'jump component call',
      section: sections.general,
      perform: () =>
        selectionState.type === 'elementSelected' && jumpToComponentCall(selectionState.selectedNode),
    },
    focusOnClassEditor: {
      showIf: selectionState.type === 'elementSelected' && selectionState.selectedNode instanceof Element,
      section: sections.general,
      name: 'Focus on class editor',
      shortcut: ['KeyE'],
      perform: () => {
        classEditor.focus()
      },
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
      showIf: selectionState.type === 'elementSelected' && !!selectionState.selectedNode.previousSibling,
      name: 'Move up',
      shortcut: ['Shift+KeyK'],
      section: sections.general,
      perform: () => selectionState.type === 'elementSelected' && moveNode(selectionState.selectedNode, 'up'),
    },
    moveDown: {
      showIf: selectionState.type === 'elementSelected' && !!selectionState.selectedNode.nextSibling,
      name: 'Move down',
      shortcut: ['Shift+KeyJ'],
      section: sections.general,
      perform: () =>
        selectionState.type === 'elementSelected' && moveNode(selectionState.selectedNode, 'down'),
    },
    insertDivChild: {
      showIf: selectionState.type === 'elementSelected' && selectionState.selectedNode instanceof Element,
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
    ...(selectionState.type === 'elementSelected' && selectionState.selectedNode instanceof Element
      ? Object.fromEntries(
          htmlTags
            .filter((tagName) => tagName !== (selectionState.selectedNode as Element).tagName.toLowerCase())
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
      perform: () => selectionState.type === 'elementSelected' && tryToUndoLatestChange(),
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
          <div className="pt-2 text-xs uppercase">
            <span className="flex items-center w-full h-6 px-2 bg-theme-bg-highlight">{item}</span>
          </div>
        ) : (
          <div className={`flex justify-between px-2 ${active ? 'bg-theme-accent' : ''}`}>
            <div>{item.name}</div>
            <div className="flex items-center gap-1">
              {item.shortcut &&
                item.shortcut.length > 0 &&
                item.shortcut.map((key, idxItem) => {
                  const isMac = navigator.platform.toUpperCase().startsWith('MAC')

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
                      className={`w-5 text-center uppercase font-mono bg-theme-bg-highlight/90 h-5 inline rounded-md ${
                        !!symbolReplaceMap[keyElement] ? 'text-lg leading-5' : 'text-xs py-1 leading-4'
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
      className="pointer-events-none absolute z-[10000] outline outline-2 outline-theme-blue"
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
      className="absolute pointer-events-none outline outline-1 outline-theme-blue"
      style={{
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

function makeJumpToCodeLink({ fileName, lineNumber, columnNumber }: FiberSource, schema: string) {
  const fileNameNormalized = normalizePath(fileName)
  if (schema === 'webstorm') {
    return `${schema}://open?file=${fileNameNormalized}&line=${lineNumber}&column=${columnNumber}`
  }
  return `${schema}://file${fileNameNormalized}:${lineNumber}:${columnNumber}`
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
