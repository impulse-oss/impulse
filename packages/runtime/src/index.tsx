import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { get, set } from 'idb-keyval'
import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import generate from '@babel/generator'
import * as t from '@babel/types'
import { detectRootPath, fileToText, fsGetFile, fsWriteToFile } from './fs'
import {
  KBarProvider,
  KBarPortal,
  KBarPositioner,
  KBarAnimator,
  KBarSearch,
  useMatches,
  NO_GROUP,
} from 'kbar'

mountApp()

function mountApp() {
  if (typeof window === 'undefined') {
    return
  }

  const rootElement = document.createElement('div')
  rootElement.id = 'swip-root'
  rootElement.style.position = 'absolute'
  rootElement.style.top = '0'
  rootElement.style.left = '0'
  document.body.appendChild(rootElement)

  const root = ReactDOM.createRoot(rootElement)
  root.render(<SwipRoot />)
}

function makeVscodeLink({ fileName, lineNumber, columnNumber }: FiberSource) {
  return `vscode://file${fileName}:${lineNumber}:${columnNumber}`
}

function SwipRoot() {
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(
    null,
  )

  // jump
  useEffect(() => {
    ;(window as any).JUMP = () => {
      if (!selectedElement) {
        return
      }

      const fiber = getReactFiber(selectedElement)
      if (!fiber) {
        return
      }

      const source = fiber._debugSource
      const vscodeLink = makeVscodeLink(source)
      window.open(vscodeLink)
    }
  }, [selectedElement])

  // read
  useEffect(() => {
    ;(window as any).READ = async () => {
      if (!selectedElement) {
        return
      }

      const fiber = getReactFiber(selectedElement)
      if (!fiber) {
        return
      }

      const source = fiber._debugSource

      const dirHandler = await (async () => {
        const savedDirHandler = (await get(
          'dirHandler',
        )) as FileSystemDirectoryHandle
        if (savedDirHandler) {
          return savedDirHandler
        }

        const dirHandler = await window.showDirectoryPicker()
        await dirHandler.requestPermission({ mode: 'readwrite' })
        await set('dirHandler', dirHandler)
        return dirHandler
      })()

      const rootPath = await detectRootPath(dirHandler, source.fileName)

      if (!rootPath) {
        return
      }

      const relativePath = source.fileName.replace(rootPath, '')
      const fileHandle = await fsGetFile(dirHandler, relativePath)

      if (!fileHandle) {
        return
      }

      const text = await fileToText(await fileHandle.getFile())
      const ast = parse(text, {
        sourceType: 'unambiguous',
        plugins: ['typescript', 'jsx'],
      })

      traverse(ast, {
        JSXElement(path) {
          const loc = path.node.openingElement.name.loc
          const isTargetTag =
            loc?.start.line === source.lineNumber &&
            loc?.start.column === source.columnNumber
          if (!isTargetTag) {
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
      })

      const code = generate(ast, {
        retainLines: true,
        comments: true,
        retainFunctionParens: true,
      }).code

      await fsWriteToFile(fileHandle, code)
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
            // return selectParent(selectedElement)
            return
          }

          setSelectedElement(previousElement as HTMLElement)
        },
        ArrowDown: () => {
          const nextElement = selectedElement.nextElementSibling

          if (!nextElement) {
            // return selectParent(selectedElement)
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

          <SelectedElementDetails selectedElement={selectedElement} />
        </>
      )}

      <KBarProvider actions={[]}>
        <KBarPortal>
          <KBarPositioner>
            <KBarAnimator>
              <KBarSearch /> 
            </KBarAnimator>
          </KBarPositioner>
        </KBarPortal>
      </KBarProvider>
    </div>
  )
}

function elementGetAbsolutePosition(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height,
  }
}

function getReactFiber(element: HTMLElement) {
  const key = Object.keys(element).find((key) => {
    return key.startsWith('__reactFiber$')
  })

  if (!key) {
    return null
  }

  const domFiber = element[key as keyof typeof element] as unknown as Fiber
  return domFiber
}

type FiberSource = {
  fileName: string
  lineNumber: number
  columnNumber: number
}

type Fiber = {
  _debugSource: FiberSource
}

function SelectionBox(props: { selectedElement: HTMLElement }) {
  const { selectedElement } = props
  const absolutePosition = elementGetAbsolutePosition(selectedElement)

  return (
    <div
      style={{
        position: 'absolute',
        outline: '2px solid #0399FF',
        zIndex: '100',
        // background: `rgba(255, 0, 0, 0.2)`,
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
      style={{
        position: 'absolute',
        background: 'rgba(0, 255, 0, 0.1)',
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
      style={{
        position: 'absolute',
        outline: '1px solid #0399FF',
        ...absolutePosition,
      }}
    ></div>
  )
}

function SelectionBoxChild(props: { selectedElement: HTMLElement }) {
  const { selectedElement } = props
  const absolutePosition = elementGetAbsolutePosition(selectedElement)

  const x = {
    top: absolutePosition.top + 1,
    left: absolutePosition.left + 1,
    width: absolutePosition.width - 2,
    height: absolutePosition.height - 2,
  }

  return (
    <div
      style={{
        position: 'absolute',
        border: '1px solid rgba(0, 0, 0, 0.4)',
        // background: `rgba(0, 0, 255, 0.2)`,
        ...x,
      }}
    ></div>
  )
}

function SelectedElementDetails(props: { selectedElement: HTMLElement }) {
  return (
    <div
      style={{
        position: 'fixed',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        bottom: '5%',
        width: '100%',
        zIndex: '99999',
      }}
    >
      {props.selectedElement.parentElement && (
        <div
          style={{
            backgroundColor: 'rgba(100, 255, 100, 1)',
          }}
        >
          {elemenentToString(props.selectedElement.parentElement)}
        </div>
      )}
      <div
        style={{
          // backgroundColor: 'rgba(255, 100, 100, 1)',
          backgroundColor: '#70C5FF',
        }}
      >
        {elemenentToString(props.selectedElement)}
      </div>
    </div>
  )
}

function elemenentToString(element: HTMLElement) {
  return `<${element.tagName.toLocaleLowerCase()} ${Array.from(
    element.attributes,
  )
    .map((attribute) => `${attribute.name}="${attribute.value}"`)
    .join(' ')}>`
}

export default SwipRoot
