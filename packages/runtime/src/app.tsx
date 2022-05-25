import { createContext, useContext, useEffect, useState } from 'react'
import { TraverseOptions } from '@babel/traverse'
import * as t from '@babel/types'
import { fsGetSourceForElement, fsWriteToFile, useDirHandle } from './fs'
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
import { elementGetAbsolutePosition } from './dom'
import { ElementNavbar } from './navbar'
import { isSourceJsxElement, transformCode } from './ast'
import { getReactFiber, FiberSource } from './react-source'

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
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(
    null,
  )

  const { currentRootActionId, searchQuery } = useKBar((state) => {
    return {
      currentRootActionId: state.currentRootActionId,
      searchQuery: state.searchQuery,
    }
  })

  useEffect(() => {
    if (!selectedElement) {
      return
    }

    const observer = new MutationObserver(() => {
      rerender()
    })

    observer.observe(selectedElement, {
      attributes: true,
      subtree: true,
      childList: true,
    })

    return () => {
      observer.disconnect()
    }
  }, [selectedElement])

  const [__rerenderValue, __setRerenderValue] = useState(0)
  const rerender = () => __setRerenderValue(Math.random())
  ;(window as any).R = rerender

  const kbarContext = useContext(KBarContext)

  const jumpToCode = (selectedElement: HTMLElement) => {
    const fiber = getReactFiber(selectedElement)
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
    const sourceFile = await fsGetSourceForElement(
      selectedElement,
      getDirHandle,
    )
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
    rerender()
  }

  const addClass = async (
    selectedElement: HTMLElement,
    classNameToAdd: string,
  ) => {
    const sourceFile = await fsGetSourceForElement(
      selectedElement,
      getDirHandle,
    )
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
    rerender()
  }

  useRegisterActions(
    [
      ...(selectedElement
        ? [
            {
              id: 'jump-to-code',
              name: 'Jump to code',
              shortcut: ['c'],
              keywords: 'jump code',
              section: 'General',
              perform: () => selectedElement && jumpToCode(selectedElement),
            },

            {
              id: 'add-class',
              name: 'Add class',
              shortcut: ['a'],
              keywords: 'add class',
              section: 'General',
            },

            ...(currentRootActionId === 'add-class' && searchQuery !== ''
              ? [
                  {
                    id: `add-class-custom-${searchQuery}`,
                    name: `> ${searchQuery}`,
                    shortcut: [],
                    section: 'Add class',
                    parent: 'add-class',
                    perform: () => {
                      selectedElement && addClass(selectedElement, searchQuery)
                    },
                  },
                ]
              : []),

            ...(selectedElement.classList.length > 0
              ? [
                  {
                    id: 'remove-class',
                    name: 'Remove class',
                    shortcut: [],
                    keywords: 'remove class',
                    section: 'General',
                  },

                  ...Array.from(selectedElement.classList).map((className) => ({
                    id: `remove-class-${className}`,
                    name: `${className}`,
                    shortcut: [],
                    section: 'Remove class',
                    parent: 'remove-class',
                    perform: () =>
                      selectedElement &&
                      removeClass(selectedElement, className),
                  })),
                ]
              : []),
          ]
        : []),
    ],
    [selectedElement, __rerenderValue, currentRootActionId, searchQuery],
  )

  const { getDirHandle } = useDirHandle()

  // read
  useEffect(() => {
    ;(window as any).READ = async () => {
      if (!selectedElement) {
        return
      }

      const sourceFile = await fsGetSourceForElement(
        selectedElement,
        getDirHandle,
      )
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

          const className =
            existingClassNameAttribute ??
            t.jsxAttribute(t.jsxIdentifier('className'), t.stringLiteral(''))

          if (className.value?.type === 'StringLiteral') {
            className.value = t.stringLiteral(
              `${className.value.value} text-action`,
            )
          }

          if (!existingClassNameAttribute) {
            attributes.push(className)
          }
        },
      }

      const code = transformCode(sourceFile.text, visitor).code!

      await fsWriteToFile(sourceFile.fileHandle, code)
    }
  }, [selectedElement])

  // click
  useEffect(() => {
    const elementOnClick = (event: MouseEvent) => {
      const elementUnderCursor = event.target as HTMLElement
      if (elementUnderCursor.closest('#swip-root')) {
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
      if (!selectedElement) {
        return
      }

      if (kbarContext.getState().visualState === VisualState.showing) {
        return
      }

      const selectParent = (element: HTMLElement) => {
        const parent = element.parentElement
        if (!parent) {
          return
        }
        setSelectedElement(parent)
      }

      const actionsMap = {
        ArrowLeft: () => {
          selectParent(selectedElement)
        },
        ArrowUp: () => {
          const previousElement = selectedElement.previousElementSibling

          if (!previousElement) {
            return
          }

          setSelectedElement(previousElement as HTMLElement)
        },
        ArrowDown: () => {
          const nextElement = selectedElement.nextElementSibling

          if (!nextElement) {
            return
          }

          setSelectedElement(nextElement as HTMLElement)
        },
        ArrowRight: () => {
          const firstChild = selectedElement.firstElementChild

          if (!firstChild) {
            return
          }
          setSelectedElement(firstChild as HTMLElement)
        },
        Escape: () => {
          if (selectedElement) {
            setSelectedElement(null)
            return true
          }
          return false
        },
      }

      const action = actionsMap[event.key as keyof typeof actionsMap]
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
  }, [selectedElement])

  return (
    // <SwipAppContext.Provider
    //   value={{
    //     selectedElement,
    //     __rerenderValue,
    //     rerender,
    //   }}
    // >
    <div>
      {selectedElement && (
        <>
          <SelectionBox selectedElement={selectedElement} />
          {selectedElement.parentElement && (
            <>
              <SelectionBoxParent
                selectedElement={selectedElement.parentElement}
              />
              {Array.from(selectedElement.parentElement.children)
                .filter((element) => {
                  return element !== selectedElement
                })
                .map((element, idx) => {
                  return (
                    <SelectionBoxSibling
                      key={idx}
                      selectedElement={element as HTMLElement}
                    />
                  )
                })}
            </>
          )}
          {Array.from(selectedElement.children).map((child, idx) => (
            <SelectionBoxChild
              key={idx}
              selectedElement={child as HTMLElement}
            />
          ))}
          <ElementNavbar
            selectedElement={selectedElement}
            onElementClick={setSelectedElement}
          />
        </>
      )}
      <KBarPortal>
        <KBarPositioner className="swip-styles">
          <KBarAnimator className="rounded-lg w-full max-w-xl overflow-hidden bg-white text-black">
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
            className={`flex justify-between text-slate-900 px-4 py-2 ${
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

function SelectionBox(props: { selectedElement: HTMLElement }) {
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

function SelectionBoxParent(props: { selectedElement: HTMLElement }) {
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

function SelectionBoxSibling(props: { selectedElement: HTMLElement }) {
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

function SelectionBoxChild(props: { selectedElement: HTMLElement }) {
  const { selectedElement } = props
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
