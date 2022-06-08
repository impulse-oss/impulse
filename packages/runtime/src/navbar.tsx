import animatedScrollTo from 'animated-scroll-to'
import { ForwardedRef, forwardRef, useEffect, useRef } from 'react'
import { elementGetAbsolutePosition } from './dom'
import { nodeIsComponentRoot, getReactFiber } from './react-source'

export const ElementNavbar = forwardRef(
  (
    props: {
      selectedNode: Node
      onNodeClick: (element: Node) => void
    },
    ref: ForwardedRef<HTMLDivElement>,
  ) => {
    const { selectedNode } = props
    const parentElement = selectedNode.parentElement

    const selectedNodeContainerRef = useRef<HTMLDivElement>(null)
    const selectedNodeElementRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      if (
        !selectedNodeElementRef.current ||
        !selectedNodeContainerRef.current
      ) {
        return
      }

      animatedScrollTo(selectedNodeElementRef.current, {
        elementToScroll: selectedNodeContainerRef.current,
      })
    }, [selectedNode])

    if (!parentElement) {
      return null
    }

    const parentFiber = getReactFiber(parentElement)

    const siblings = Array.from(parentElement.childNodes).filter(
      (element) => !element.__impulseHide,
    )

    const children = Array.from(selectedNode.childNodes).filter(
      (element) => !element.__impulseHide,
    )

    const {width, height} = elementGetAbsolutePosition(selectedNode)

    return (
      <div
        ref={ref}
        className="fixed w-full bottom-0 z-[10050] text-xs font-mono pointer-events-none"
      >
        <div
          className="mx-auto drop-shadow-lg grid justify-center w-2/3 bg-white min-w-[680px] h-[200px] rounded-t-lg border-t border-x border-slate-300 pointer-events-auto"
          style={{
            gridTemplateColumns: '1fr 5fr 1fr',
          }}
        >
          <div
            className="flex flex-col bg-[#a6fea6] justify-center items-center cursor-pointer rounded-tl-lg text-center"
            onClick={() => props.onNodeClick(parentElement)}
          >
            {typeof parentFiber?._debugOwner?.elementType === 'function' && (
              <div>{parentFiber._debugOwner.elementType.name}</div>
            )}
            {'<'}
            {parentElement.tagName.toLowerCase()}
            {'>'}
            {Array.from(parentElement.classList).map((cls, idx) => {
              return <div className="border-b border-[#65db65]" key={idx}>{cls}</div>
            })}
          </div>
          <div
            ref={selectedNodeContainerRef}
            className="flex flex-col bg-white overflow-y-auto"
          >
            {siblings.map((childElement, idx) => {
              const isSelectedElement = childElement === selectedNode

              return (
                <div
                  key={idx}
                  {...(isSelectedElement
                    ? { ref: selectedNodeElementRef }
                    : {})}
                  className="p-2 flex-shrink-0 cursor-pointer min-h-1/4"
                  style={{
                    borderBottom: '1px solid #0399FF',
                    outline: isSelectedElement ? `2px solid #0399FF` : 'none',
                    outlineOffset: `-2px`,
                  }}
                  onClick={() => {
                    props.onNodeClick(childElement)
                  }}
                >
                  <ElementDetails node={childElement} />
                </div>
              )
            })}
          </div>
          <div className="flex flex-col overflow-y-auto bg-[#eeeeee] items-center rounded-tr-lg">
            <div className="mt-2">{width}x{height}</div>
            <div className='flex flex-col justify-center items-center grow'>
              {children.map((childElement, idx) => {
                return (
                  <div
                    key={idx}
                    className="cursor-pointer"
                    onClick={() => props.onNodeClick(childElement)}
                  >
                    {childElement instanceof HTMLElement ? (
                      <>
                        {'<'}
                        {childElement.tagName.toLowerCase()}
                        {'>'}
                      </>
                    ) : (
                      '#text'
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  },
)

function ElementDetails(props: { node: Node }) {
  const { node } = props

  const fiber = getReactFiber(node)
  const ownerType = fiber?._debugOwner?.elementType

  const truncate = (str: string, maxLength: number) => {
    if (str.length <= maxLength) {
      return str
    }

    return str.substring(0, maxLength) + '...'
  }

  if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) {
    const text = node.textContent || '<empty string>'
    return <>"{truncate(text, 50)}"</>
  }

  return (
    <div>
      {'<'}
      <b>{node.tagName.toLocaleLowerCase()}</b>
      {Array.from(node.attributes).map((attribute, idx) => {
        return (
          <span key={attribute.name + idx}>
            {' '}
            <span className="whitespace-nowrap">{attribute.name}</span>=
            <span className="text-red-700">"{attribute.value}"</span>
          </span>
        )
      })}
      {'>'}
      {typeof ownerType === 'function' && (
        <span>
          {' '}
          ({ownerType.name}
          {nodeIsComponentRoot(node) && ' root'})
        </span>
      )}
    </div>
  )
}
