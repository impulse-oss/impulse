import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { TraverseOptions } from '@babel/traverse'
import * as t from '@babel/types'
import { fsGetSourceForNode, fsWriteToFile, useDirHandle } from './fs'
import {
  KBarProvider,
  KBarPortal,
  KBarPositioner,
  KBarAnimator,
  KBarSearch,
  useMatches,
  KBarResults,
  useRegisterActions,
  KBarContext,
  VisualState,
  useKBar,
} from 'kbar'
import { elementGetAbsolutePosition, observeNode } from './dom'
import { ElementNavbar } from './navbar'
import { isSourceJsxElement, transformCode } from './ast'
import { getReactFiberWithSource, FiberSource } from './react-source'

declare global {
  interface Window {
    $swip?: Node
  }
  interface Node {
    swipHide?: boolean
  }
}

export function SwipRoot() {
  return (
    <div
      id="swip-root"
      className="swip-styles"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
      }}
    >
      <KBarProvider options={{ disableScrollbarManagement: true }}>
        <SwipApp />
      </KBarProvider>
    </div>
  )
}

const SwipAppContext = createContext<{
  selectedElement: HTMLElement | null
  __rerenderValue: number
  rerender: () => void
}>({ __rerenderValue: 0, selectedElement: null, rerender: () => {} })

function SwipApp() {
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

    window.$swip = selectedElement
  }

  const removeElementSelection = () => {
    setSelectionState({ type: 'elementNotSelected' })
  }

  const onSelectedElementRemoved = () => {
    if (selectionState.type !== 'elementSelected') {
      return
    }

    const { parentElement, indexInsideParent } = selectionState
    const children = [...parentElement.children]

    const siblingSameSpot = children[indexInsideParent] as
      | HTMLElement
      | undefined
    const siblingBefore = children[indexInsideParent - 1] as
      | HTMLElement
      | undefined
    const siblingAfter = children[indexInsideParent + 1] as
      | HTMLElement
      | undefined

    if (siblingSameSpot && !siblingSameSpot.swipHide) {
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

  const jumpToCode = (selectedElement: Node) => {
    const fiber = getReactFiberWithSource(selectedElement)
    if (!fiber) {
      return
    }

    const source = fiber._debugSource
    if (!source) {
      return
    }

    const vscodeLink = makeVscodeLink(source)
    window.open(vscodeLink)
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

  const removeElement = async (selectedElement: HTMLElement) => {
    const sourceFile = await fsGetSourceForNode(selectedElement, getDirHandle)
    if (!sourceFile) {
      return
    }

    const visitor: TraverseOptions = {
      JSXElement(path) {
        if (!isSourceJsxElement(path.node, sourceFile.fiberSource)) {
          return
        }

        path.remove()
      },
    }

    const code = transformCode(sourceFile.text, visitor).code!

    const oldDisplay = selectedElement.style.display

    selectedElement.swipHide = true
    selectedElement.style.display = 'none'
    onSelectedElementRemoved()
    await fsWriteToFile(sourceFile.fileHandle, code)

    await new Promise<void>((resolve) => {
      const observers = observeNode(selectedElement, () => {
        observers.observer.disconnect()
        observers.parentObserver?.disconnect()
        resolve()
      })
    })

    selectedElement.style.display = oldDisplay
    if (selectedElement.getAttribute('style') === '') {
      selectedElement.removeAttribute('style')
    }
    selectedElement.swipHide = false
  }

  useRegisterActions(
    [
      ...(selectionState.type === 'elementSelected'
        ? [
            {
              id: 'jump-to-code',
              name: 'Jump to code',
              shortcut: ['c'],
              keywords: 'jump code',
              section: 'General',
              perform: () =>
                selectionState.selectedNode &&
                jumpToCode(selectionState.selectedNode),
            },

            ...(selectionState.selectedNode instanceof HTMLElement ? [{
              id: 'add-class',
              name: 'Add class',
              shortcut: ['a'],
              keywords: 'add class',
              section: 'General',
            }] : []),

            ...(currentRootActionId === 'add-class' &&
            searchQuery !== '' &&
            selectionState.selectedNode instanceof HTMLElement
              ? [
                  {
                    id: `add-class-custom-${searchQuery}`,
                    name: `> ${searchQuery}`,
                    shortcut: [],
                    section: 'Add class',
                    parent: 'add-class',
                    perform: () => {
                      selectionState.type === 'elementSelected' &&
                        addClass(
                          selectionState.selectedNode as HTMLElement,
                          searchQuery,
                        )
                    },
                  },
                ]
              : []),

            ...(selectionState.selectedNode instanceof HTMLElement &&
            selectionState.selectedNode.classList.length > 0
              ? [
                  {
                    id: 'remove-class',
                    name: 'Remove class',
                    shortcut: [],
                    keywords: 'remove class',
                    section: 'General',
                  },

                  ...Array.from(selectionState.selectedNode.classList).map(
                    (className) => ({
                      id: `remove-class-${className}`,
                      name: `${className}`,
                      shortcut: [],
                      section: 'Remove class',
                      parent: 'remove-class',
                      perform: () =>
                        selectionState.type === 'elementSelected' &&
                        removeClass(selectionState.selectedNode as HTMLElement, className),
                    }),
                  ),
                ]
              : []),

            ...(selectionState.selectedNode instanceof HTMLElement ? [{
              section: 'General',
              id: 'remove-element',
              name: 'Remove element',
              shortcut: [],
              perform: () =>
                selectionState.type === 'elementSelected' &&
                removeElement(selectionState.selectedNode as HTMLElement),
            }] : []),
          ]
        : []),
    ],
    [selectionState, __rerenderValue, currentRootActionId, searchQuery],
  )

  // click
  useEffect(() => {
    const elementOnClick = (event: MouseEvent) => {
      const elementUnderCursor = event.target as Node
      const parentElement = elementUnderCursor.parentElement

      if (!parentElement) {
        return
      }

      if (parentElement.id === 'swip-root' || parentElement.closest('#swip-root')) {
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
          const previousNode =
            selectionState.selectedNode.previousSibling

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
    // <SwipAppContext.Provider
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
        <KBarPositioner className="swip-styles" style={{ zIndex: 150 }}>
          <KBarAnimator className="rounded-lg w-full max-w-xl overflow-hidden bg-white text-slate-900 drop-shadow-lg border">
            <KBarSearch className="py-3 px-4 text-base w-full box-border outline-0 border-0 m-0" />
            <RenderResults />
          </KBarAnimator>
        </KBarPositioner>
      </KBarPortal>
    </div>
    // </SwipAppContext.Provider>
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
