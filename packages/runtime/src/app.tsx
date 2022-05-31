import { NodePath, TraverseOptions } from '@babel/traverse'
import * as t from '@babel/types'
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
  findNodeAmongJsxChildren,
  isSourceJsxElement,
  JSXNode,
  transformCode,
  transformNodeInCode,
  writeTransformationResultToFile,
} from './ast'
import {
  elementGetAbsolutePosition,
  observeNode,
  waitForAnyNodeMutation,
} from './dom'
import { fsGetSourceForNode, fsWriteToFile, useDirHandle } from './fs'
import { ElementNavbar } from './navbar'
import { FiberSource, getReactFiber } from './react-source'

declare global {
  interface Window {
    $i?: Node
  }
  interface Node {
    __impulseHide?: boolean
  }
}

export function ImpulseRoot() {
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
      <KBarProvider options={{ disableScrollbarManagement: true }}>
        <ImpulseApp />
      </KBarProvider>
    </div>
  )
}

const ImpulseAppContext = createContext<{
  selectedElement: HTMLElement | null
  __rerenderValue: number
  rerender: () => void
}>({ __rerenderValue: 0, selectedElement: null, rerender: () => {} })

function ImpulseApp() {
  const [selectionState, setSelectionState] = useState<
    | {
        type: 'elementSelected'
        selectedNode: Node
        parentElement: HTMLElement
        indexInsideParent: number
      }
    | {
        type: 'elementNotSelected'
      }
  >({ type: 'elementNotSelected' })

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

    window.$i = selectedElement
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

    const siblingSameSpot = children[indexInsideParent] as
      | HTMLElement
      | undefined
    const siblingBefore = children[indexInsideParent - 1] as
      | HTMLElement
      | undefined
    const siblingAfter = children[indexInsideParent + 1] as
      | HTMLElement
      | undefined

    if (siblingSameSpot && !siblingSameSpot.__impulseHide) {
      setSelectedElement(siblingSameSpot)
      return
    }

    if (siblingBefore) {
      setSelectedElement(siblingBefore)
      return
    }

    if (siblingAfter) {
      setSelectedElement(siblingAfter, {
        indexInsideParent: indexInsideParent - 1,
      })
      return
    }

    setSelectedElement(parentElement)
  }

  const { currentRootActionId, searchQuery } = useKBar((state) => {
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

    return () => {
      observer.disconnect()
      if (parentObserver) {
        parentObserver.disconnect()
      }
    }
  }, [selectionState])

  const [__rerenderValue, __setRerenderValue] = useState(0)
  const rerender = () => __setRerenderValue(Math.random())

  const kbarContext = useContext(KBarContext)

  const { getDirHandle } = useDirHandle()

  const jumpToCode = async (selectedElement: Node) => {
    const source = getReactFiber(selectedElement)?._debugSource
    const parentSource = selectedElement.parentElement
      ? getReactFiber(selectedElement.parentElement)?._debugSource
      : undefined

    if (selectedElement instanceof HTMLElement) {
      if (!source) {
        return
      }

      const vscodeLink = makeVscodeLink(source)
      window.open(vscodeLink)
      return
    }

    if (!parentSource) {
      return
    }

    const transformResult = await transformNodeInCode(
      selectedElement,
      (path) => {
        return path.node
      },
      await getDirHandle({ mode: 'read' }),
    )

    if (transformResult.type === 'error') {
      return
    }

    const targetJsxText = transformResult.visitorResult

    if (!targetJsxText?.loc) {
      return
    }

    const vscodeLink = makeVscodeLink({
      ...parentSource,
      lineNumber: targetJsxText.loc.end.line,
      columnNumber: targetJsxText.loc.end.column + 1,
    })
    window.open(vscodeLink)

    return
  }

  const removeClass = async (
    selectedElement: HTMLElement,
    classNameToRemove: string,
  ) => {
    const sourceFile = await fsGetSourceForNode(selectedElement, getDirHandle)
    if (!sourceFile) {
      return
    }

    const visitor: TraverseOptions = {
      JSXElement({ node }) {
        if (!isSourceJsxElement(node, sourceFile.fiberSource)) {
          return
        }

        const attributes = node.openingElement.attributes

        const existingClassNameAttribute = attributes.find(
          (attribute) =>
            attribute.type === 'JSXAttribute' &&
            attribute.name.name === 'className',
        ) as t.JSXAttribute

        if (!existingClassNameAttribute) {
          return
        }

        const classNameAttrValue = existingClassNameAttribute.value
        if (classNameAttrValue?.type !== 'StringLiteral') {
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
    }

    const code = transformCode(sourceFile.text, visitor).code!

    selectedElement.classList.remove(classNameToRemove)
    if (selectedElement.classList.length === 0) {
      selectedElement.removeAttribute('class')
    }
    await fsWriteToFile(sourceFile.fileHandle, code)
  }

  const addClass = async (
    selectedElement: HTMLElement,
    classNameToAdd: string,
  ) => {
    const sourceFile = await fsGetSourceForNode(selectedElement, getDirHandle)
    if (!sourceFile) {
      return
    }

    const visitor: TraverseOptions = {
      JSXElement(path) {
        if (!isSourceJsxElement(path.node, sourceFile.fiberSource)) {
          return
        }

        const attributes = path.node.openingElement.attributes

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
    }

    const code = transformCode(sourceFile.text, visitor).code!

    selectedElement.classList.add(classNameToAdd)
    await fsWriteToFile(sourceFile.fileHandle, code)
  }

  const removeNode = async (selectedElement: Node) => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      (path) => {
        path.remove()
      },
      await getDirHandle({ mode: 'readwrite' }),
    )

    if (transformResult.type === 'error') {
      return
    }

    if (!(selectedElement instanceof HTMLElement)) {
      await writeTransformationResultToFile(transformResult)
      return
    }

    const oldDisplay = selectedElement.style.display

    selectedElement.__impulseHide = true
    selectedElement.style.display = 'none'
    onSelectedElementRemoved()

    await writeTransformationResultToFile(transformResult)

    await waitForAnyNodeMutation(selectedElement)

    selectedElement.style.display = oldDisplay
    if (selectedElement.getAttribute('style') === '') {
      selectedElement.removeAttribute('style')
    }
    selectedElement.__impulseHide = false
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
    )

    if (transformResult.type === 'error') {
      return
    }

    await writeTransformationResultToFile(transformResult)

    await waitForAnyNodeMutation(selectedElement)

    if (selectedElement.previousSibling) {
      setSelectedElement(selectedElement.previousSibling!)
    }
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
    selectedElement: HTMLElement,
    jsxNodeToInsert: JSXNode,
  ) => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      (path) => {
        path.node.children.push(jsxNodeToInsert)
      },
      await getDirHandle({ mode: 'readwrite' }),
    )

    if (transformResult.type === 'error') {
      return
    }

    await writeTransformationResultToFile(transformResult)

    await waitForAnyNodeMutation(selectedElement)

    setSelectedElement(selectedElement.lastChild!)
  }

  const changeTag = async (
    selectedElement: HTMLElement,
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
        if (parent.type !== 'JSXElement') {
          return
        }

        const children = parent.children.filter((childNode) => {
          if (
            childNode.type === 'JSXText' &&
            childNode.value.trim().length === 0
          ) {
            return false
          }
          return true
        })

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

    // for some reason, Vite fast refresh doesn't fully recreate the dom on first save, some of the time
    await writeTransformationResultToFile(transformResult)
    await waitForAnyNodeMutation(selectedElement)

    const sibling = parent.children[newChildIndex]
    if (sibling) {
      setSelectedElement(sibling)
    }
  }

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
      shortcut: ['c'],
      keywords: 'jump code',
      section: sections.general,
      perform: () =>
        selectionState.type === 'elementSelected' &&
        jumpToCode(selectionState.selectedNode),
    },
    removeElement: {
      showIf: selectionState.type === 'elementSelected',
      name: 'Remove element',
      shortcut: ['d', 'd'],
      section: sections.general,
      perform: () =>
        selectionState.type === 'elementSelected' &&
        removeNode(selectionState.selectedNode),
    },
    moveUp: {
      showIf:
        selectionState.type === 'elementSelected' &&
        !!selectionState.selectedNode.previousSibling,
      name: 'Move up',
      shortcut: ['m', 'u'],
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
      shortcut: ['m', 'd'],
      section: sections.general,
      perform: () =>
        selectionState.type === 'elementSelected' &&
        moveNode(selectionState.selectedNode, 'down'),
    },
    insertDivBefore: {
      showIf: selectionState.type === 'elementSelected',
      name: 'Insert before: <div>',
      shortcut: ['i', 'b'],
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
      shortcut: ['i', 'a'],
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
    insertDivChild: {
      showIf:
        selectionState.type === 'elementSelected' &&
        selectionState.selectedNode instanceof HTMLElement,
      name: 'Insert child: <div>',
      shortcut: ['i', 'i'],
      section: sections.general,
      perform: () =>
        selectionState.type === 'elementSelected' &&
        insertChild(
          selectionState.selectedNode as HTMLElement,
          t.jsxElement(
            t.jsxOpeningElement(t.jsxIdentifier('div'), []),
            t.jsxClosingElement(t.jsxIdentifier('div')),
            [],
          ),
        ),
    },
    addClassFromSearch: {
      showIf:
        selectionState.type === 'elementSelected' &&
        searchQuery !== '' &&
        searchQuery.split(' ').length === 1 &&
        selectionState.selectedNode instanceof HTMLElement,
      name: `> ${searchQuery}`,
      shortcut: [],
      section: {
        name: 'Add class',
        priority: -10,
      },
      perform: () => {
        selectionState.type === 'elementSelected' &&
          addClass(selectionState.selectedNode as HTMLElement, searchQuery)
      },
    },
    ...(selectionState.type === 'elementSelected' &&
    selectionState.selectedNode instanceof HTMLElement
      ? Object.fromEntries(
          Array.from(selectionState.selectedNode.classList).map((className) => [
            `removeClass-${className}`,
            {
              name: `${className}`,
              shortcut: [],
              section: sections.removeClass,
              perform: () =>
                selectionState.type === 'elementSelected' &&
                removeClass(
                  selectionState.selectedNode as HTMLElement,
                  className,
                ),
            },
          ]),
        )
      : {}),
    ...(selectionState.type === 'elementSelected' &&
    selectionState.selectedNode instanceof HTMLElement
      ? Object.fromEntries(
          htmlTags
            .filter(
              (tagName) =>
                tagName !==
                (
                  selectionState.selectedNode as HTMLElement
                ).tagName.toLowerCase(),
            )
            .map((tagName) => [
              `changeTag-${tagName}`,
              {
                name: `<${tagName}>`,
                shortcut: [],
                section: sections.changeTag,
                perform: () =>
                  selectionState.type === 'elementSelected' &&
                  changeTag(
                    selectionState.selectedNode as HTMLElement,
                    tagName,
                  ),
              },
            ]),
        )
      : {}),
    insertTextBefore: {
      showIf:
        selectionState.type === 'elementSelected' &&
        selectionState.selectedNode instanceof HTMLElement &&
        searchQuery !== '',
      section: sections.insertText,
      name: `Insert before: ${searchQuery}`,
      shortcut: [],
      perform: () =>
        selectionState.type === 'elementSelected' &&
        insertBeforeNode(selectionState.selectedNode, t.jsxText(searchQuery)),
    },
    insertTextAfter: {
      showIf:
        selectionState.type === 'elementSelected' &&
        selectionState.selectedNode instanceof HTMLElement &&
        searchQuery !== '',
      section: sections.insertText,
      name: `Insert after: ${searchQuery}`,
      shortcut: [],
      perform: () =>
        selectionState.type === 'elementSelected' &&
        insertAfterNode(selectionState.selectedNode, t.jsxText(searchQuery)),
    },
    insertTextChild: {
      showIf:
        searchQuery !== '' &&
        selectionState.type === 'elementSelected' &&
        selectionState.selectedNode instanceof HTMLElement,
      section: sections.insertText,
      name: `Insert child: ${searchQuery}`,
      shortcut: [],
      perform: () =>
        selectionState.type === 'elementSelected' &&
        insertChild(
          selectionState.selectedNode as HTMLElement,
          t.jsxText(searchQuery),
        ),
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

      if (event.altKey || event.ctrlKey || event.metaKey) {
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
  }, [selectionState])

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
              {Array.from(selectionState.selectedNode.parentElement.children)
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
      <KBarPortal>
        <KBarPositioner className="impulse-styles" style={{ zIndex: 150 }}>
          <KBarAnimator className="rounded-lg w-full max-w-xl overflow-hidden bg-white text-slate-900 drop-shadow-lg border">
            <KBarSearch className="py-3 px-4 text-base w-full box-border outline-0 border-0 m-0" />
            <RenderResults />
          </KBarAnimator>
        </KBarPositioner>
      </KBarPortal>
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
            {item.shortcut?.length ? (
              <div className="uppercase font-mono bg-[#d9d9d9] py-1 px-2 rounded-md text-xs">
                {item.shortcut}
              </div>
            ) : (
              <div></div>
            )}
          </div>
        )
      }
    />
  )
}

function makeVscodeLink({ fileName, lineNumber, columnNumber }: FiberSource) {
  return `vscode://file${fileName}:${lineNumber}:${columnNumber}`
}

function SelectionBox(props: { selectedElement: Node }) {
  const { selectedElement } = props
  const absolutePosition = elementGetAbsolutePosition(selectedElement)

  return (
    <div
      className="pointer-events-none absolute z-[100]"
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
