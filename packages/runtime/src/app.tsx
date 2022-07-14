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
import { useTailwind } from './tailwind'
import { undoLatestChange } from './undo'

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
      className="impulse-styles"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
      }}
    >
      <KBarProvider
        options={{
          disableScrollbarManagement: true,
          toggleShortcut: 'none! it is handled by our code',
        }}
      >
        <ImpulseApp {...props} />
        <KBarPortal>
          <KBarPositioner className="impulse-styles" style={{ zIndex: 10200 }}>
            <KBarAnimator className="rounded-lg w-full max-w-xl overflow-hidden bg-white text-slate-900 drop-shadow-lg border">
              <KBarSearch
                className="py-3 px-4 text-base w-full box-border outline-0 border-0 m-0"
                defaultPlaceholder="Start typing..."
              />
              <RenderResults />
            </KBarAnimator>
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

type SelectionState =
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
  config?: {}
}

function ImpulseApp(props: ImpulseParams) {
  const [selectionState, setSelectionState] = useState<SelectionState>({
    type: 'elementNotSelected',
  })

  const setSelectedElement = (
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

    const selectOrExit: typeof setSelectedElement = (node, parameters) => {
      if (document.body.contains(node)) {
        return setSelectedElement(node, parameters)
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

  const {
    currentRootActionId,
    searchQuery,
    query: kbarQuery,
  } = useKBar((state) => {
    return {
      currentRootActionId: state.currentRootActionId,
      searchQuery: state.searchQuery,
    }
  })

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      rerender()
    })

    resizeObserver.observe(document.body)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

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
      () => {
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

  const removeClass = async (
    selectedElement: Element,
    classNameToRemove: string,
  ) => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      ({ node }) => {
        const cWarn = (...messages: any) => {
          return warn('removeClass', ...messages)
        }
        const attributes = node.openingElement.attributes

        const existingClassNameAttribute = attributes.find(
          (attribute) =>
            attribute.type === 'JSXAttribute' &&
            attribute.name.name === 'className',
        ) as t.JSXAttribute

        if (!existingClassNameAttribute) {
          cWarn('removeClass: no className attribute found')
          return
        }

        const classNameAttrValue = existingClassNameAttribute.value
        if (classNameAttrValue?.type !== 'StringLiteral') {
          cWarn(
            'removeClass: className attribute is not a string literal, but rather a',
            classNameAttrValue?.type,
          )
          return
        }

        const classList = classNameAttrValue.value.trim().split(' ')
        const newClassList = classList.filter(
          (className) => className !== classNameToRemove,
        )

        if (newClassList.length === 0) {
          node.openingElement.attributes = attributes.filter((attribute) => {
            if (attribute.type !== 'JSXAttribute') {
              return true
            }

            return attribute.name.name !== existingClassNameAttribute.name.name
          })
          return
        }

        existingClassNameAttribute.value = t.stringLiteral(
          newClassList.join(' '),
        )
      },
      await getDirHandle({ mode: 'readwrite' }),
      { preferAncestor: 'none', prettierConfig: props.prettierConfig },
    )

    if (transformResult.type === 'error') {
      return
    }

    await writeTransformationResultToFile(transformResult)
  }

  const addClass = async (selectedElement: Element, classNameToAdd: string) => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      ({ node }) => {
        const attributes = node.openingElement.attributes

        const existingClassNameAttribute = attributes.find(
          (attribute) =>
            attribute.type === 'JSXAttribute' &&
            attribute.name.name === 'className',
        ) as t.JSXAttribute

        if (existingClassNameAttribute) {
          if (existingClassNameAttribute.value?.type !== 'StringLiteral') {
            return
          }

          const classList = existingClassNameAttribute.value.value.split(' ')
          if (classList.includes(classNameToAdd)) {
            return
          }

          classList.push(classNameToAdd)
          existingClassNameAttribute.value = t.stringLiteral(
            classList.join(' ').trim(),
          )

          return
        }

        const className = t.jsxAttribute(
          t.jsxIdentifier('className'),
          t.stringLiteral(classNameToAdd),
        )

        attributes.push(className)
      },
      await getDirHandle({ mode: 'readwrite' }),
      { preferAncestor: 'none', prettierConfig: props.prettierConfig },
    )

    if (transformResult.type === 'error') {
      return
    }

    selectedElement.classList.add(classNameToAdd)
    await writeTransformationResultToFile(transformResult)
  }

  const removeNode = async (selectedElement: Node) => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      (path) => {
        path.remove()
      },
      await getDirHandle({ mode: 'readwrite' }),
      {
        prettierConfig: props.prettierConfig,
        preferAncestor: nodeIsComponentRoot(selectedElement)
          ? 'owner'
          : 'parent',
      },
    )

    if (transformResult.type === 'error') {
      return
    }

    if (!(selectedElement instanceof HTMLElement)) {
      await writeTransformationResultToFile(transformResult)
      return
    }

    // const oldDisplay = selectedElement.style.display

    // selectedElement.__impulseHide = true
    // selectedElement.style.display = 'none'
    // onSelectedElementRemoved()

    await writeTransformationResultToFile(transformResult)

    await waitForAnyNodeMutation(selectedElement)

    // selectedElement.style.display = oldDisplay
    // if (selectedElement.getAttribute('style') === '') {
    //   selectedElement.removeAttribute('style')
    // }
    // selectedElement.__impulseHide = false
  }

  const insertBeforeNode = async (
    selectedElement: Node,
    jsxNodeToInsert: JSXNode,
  ) => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      (path) => {
        path.insertBefore(jsxNodeToInsert)
      },
      await getDirHandle({ mode: 'readwrite' }),
      { prettierConfig: props.prettierConfig },
    )

    if (transformResult.type === 'error') {
      return
    }

    await writeTransformationResultToFile(transformResult)
  }

  const insertAfterNode = async (
    selectedElement: Node,
    jsxNodeToInsert: JSXNode,
  ) => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      (path) => {
        path.insertAfter(jsxNodeToInsert)
      },
      await getDirHandle({ mode: 'readwrite' }),
      { prettierConfig: props.prettierConfig },
    )

    if (transformResult.type === 'error') {
      return
    }

    await writeTransformationResultToFile(transformResult)

    await waitForAnyNodeMutation(selectedElement)

    if (selectedElement.nextSibling) {
      setSelectedElement(selectedElement.nextSibling!)
    }
  }

  const insertChild = async (
    selectedElement: Element,
    jsxNodeToInsert: JSXNode,
  ) => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      (path) => {
        path.node.children.push(jsxNodeToInsert)
      },
      await getDirHandle({ mode: 'readwrite' }),
      { prettierConfig: props.prettierConfig },
    )

    if (transformResult.type === 'error') {
      return
    }

    await writeTransformationResultToFile(transformResult)

    await waitForAnyNodeMutation(selectedElement)

    if (selectedElement.lastChild) {
      setSelectedElement(selectedElement.lastChild)
    }
  }

  const changeTag = async (
    selectedElement: Element,
    newTagName: typeof htmlTags[0],
  ) => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      (path) => {
        if (path.node.openingElement.name.type !== 'JSXIdentifier') {
          return
        }
        path.node.openingElement.name.name = newTagName.toLowerCase()

        if (path.node.closingElement?.name.type === 'JSXIdentifier') {
          path.node.closingElement.name.name = newTagName.toLowerCase()
        }
      },
      await getDirHandle({ mode: 'readwrite' }),
      { prettierConfig: props.prettierConfig },
    )

    if (transformResult.type === 'error') {
      return
    }

    await writeTransformationResultToFile(transformResult)

    await waitForAnyNodeMutation(selectedElement)
  }

  const moveNode = async (selectedElement: Node, direction: 'up' | 'down') => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      (path) => {
        const parent = path.parentPath.node
        if (parent.type !== 'JSXElement' && parent.type !== 'JSXFragment') {
          return
        }

        const children = parent.children.filter(isNotEmptyNode)

        const index = children.indexOf(path.node)
        const siblingIndex = direction === 'up' ? index - 1 : index + 1
        const sibling = children[siblingIndex]
        if (!sibling) {
          return
        }

        ;[children[index], children[siblingIndex]] = [
          children[siblingIndex],
          children[index],
        ]
        parent.children = children
      },
      await getDirHandle({ mode: 'readwrite' }),
      {
        preferAncestor: nodeIsComponentRoot(selectedElement)
          ? 'owner'
          : 'parent',
        prettierConfig: props.prettierConfig,
      },
    )

    if (transformResult.type === 'error') {
      return
    }

    const parent = selectedElement.parentElement
    if (!parent) {
      return
    }

    if (selectionState.type !== 'elementSelected') {
      return
    }

    const newChildIndex =
      selectionState.indexInsideParent + (direction === 'up' ? -1 : 1)

    await writeTransformationResultToFile(transformResult)
    await waitForAnyNodeMutation(selectedElement)

    const sibling = parent.childNodes[newChildIndex]
    if (sibling) {
      setSelectedElement(sibling)
    }
  }

  const tryToUndoLatestChange = async () => {
    undoLatestChange(await getDirHandle({ mode: 'readwrite' }))
  }

  const { tailwindClasses } = useTailwind({
    tailwindConfig: {
      content: [],
    },
  })

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
    ...Object.fromEntries(
      Object.entries(tailwindClasses).map(([key, value]) => {
        const className = key.replace(/^\./, '')

        return [
          `addClass-${className}`,
          {
            showIf:
              selectionState.type === 'elementSelected' &&
              selectionState.selectedNode instanceof Element,
            // keywords: value.nodes.flatMap((node) => [node.prop, node.value]).join(' '),
            name: `${className}`,
            shortcut: [],
            section: sections.addClass,
            perform: () => {
              selectionState.type === 'elementSelected' &&
                addClass(selectionState.selectedNode as Element, className)
            },
          },
        ]
      }),
    ),
    addClassFromSearch: {
      showIf:
        selectionState.type === 'elementSelected' &&
        searchQuery !== '' &&
        searchQuery.split(' ').length === 1 &&
        selectionState.selectedNode instanceof Element,
      name: `> ${searchQuery}`,
      shortcut: [],
      section: sections.addClass,
      perform: () => {
        selectionState.type === 'elementSelected' &&
          addClass(selectionState.selectedNode as Element, searchQuery)
      },
    },
    ...(selectionState.type === 'elementSelected' &&
    selectionState.selectedNode instanceof Element
      ? Object.fromEntries(
          Array.from(selectionState.selectedNode.classList).map((className) => [
            `removeClass-${className}`,
            {
              name: `${className}`,
              shortcut: [],
              section: sections.removeClass,
              perform: () =>
                selectionState.type === 'elementSelected' &&
                removeClass(selectionState.selectedNode as Element, className),
            },
          ]),
        )
      : {}),
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

      setSelectedElement(elementUnderCursor)
    }

    document.addEventListener('click', elementOnClick, { capture: true })

    return () => {
      document.removeEventListener('click', elementOnClick, { capture: true })
    }
  }, [])

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

      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return
      }

      const arrowsMap = {
        ArrowLeft: () => {
          const parent = selectionState.parentElement
          if (!parent) {
            return
          }
          setSelectedElement(parent)
        },
        ArrowUp: () => {
          const previousNode = selectionState.selectedNode.previousSibling

          if (!previousNode) {
            return
          }

          setSelectedElement(previousNode)
        },
        ArrowDown: () => {
          const nextNode = selectionState.selectedNode.nextSibling

          if (!nextNode) {
            return
          }

          setSelectedElement(nextNode)
        },
        ArrowRight: () => {
          const firstChild = selectionState.selectedNode.firstChild

          if (!firstChild) {
            return
          }
          setSelectedElement(firstChild)
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
        // rootNode.style.backgroundColor = 'red'
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

  return (
    // <ImpulseAppContext.Provider
    //   value={{
    //     selectedElement,
    //     __rerenderValue,
    //     rerender,
    //   }}
    // >
    <div>
      {selectionState.type === 'elementSelected' && (
        <>
          <SelectionBox selectedElement={selectionState.selectedNode} />
          {selectionState.selectedNode.parentElement && (
            <>
              <SelectionBoxParent
                selectedElement={selectionState.selectedNode.parentElement}
              />
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
            onNodeClick={setSelectedElement}
          />
        </>
      )}
      <FsAccessWarningAlert />
    </div>
    // </ImpulseAppContext.Provider>
  )
}

function RenderResults() {
  const { results } = useMatches()

  return (
    <KBarResults
      items={results}
      onRender={({ item, active }) =>
        typeof item === 'string' ? (
          <div className="bg-white uppercase text-xs px-4 py-2">{item}</div>
        ) : (
          <div
            className={`flex justify-between px-4 py-2 ${
              active ? 'bg-[#eee]' : ''
            }`}
          >
            <div>{item.name}</div>
            <div className="flex gap-1">
              {item.shortcut &&
                item.shortcut.length > 0 &&
                item.shortcut.map((key, idx) => {
                  const isMac = navigator.platform
                    .toUpperCase()
                    .startsWith('MAC')

                  return (
                    <span
                      key={key + idx}
                      className="uppercase font-mono bg-[#d9d9d9] py-1 px-2 rounded-md text-xs"
                    >
                      {key
                        .replace('Key', '')
                        .replace('$mod', isMac ? 'Cmd' : 'Ctrl')}
                    </span>
                  )
                })}
            </div>
          </div>
        )
      }
    />
  )
}

function makeVscodeLink({ fileName, lineNumber, columnNumber }: FiberSource) {
  const fileNameNormalized = normalizePath(fileName)
  return `vscode://file${fileNameNormalized}:${lineNumber}:${columnNumber}`
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
