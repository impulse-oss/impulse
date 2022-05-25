import { ForwardedRef, forwardRef } from 'react'

export const ElementNavbar = forwardRef(
  (
    props: {
      selectedNode: Node
      onNodeClick: (element: Node) => void
    },
    ref: ForwardedRef<HTMLDivElement>,
  ) => {
    const { selectedNode: selectedElement } = props
    const parentElement = selectedElement.parentElement

    if (!parentElement) {
      return null
    }

    const siblings = Array.from(parentElement.childNodes).filter(
      (element) => !element.swipHide,
    )

    const children = Array.from(selectedElement.childNodes).filter(
      (element) => !element.swipHide,
    )

    return (
      <div
        ref={ref}
        className="fixed w-full bottom-0 z-[99999] text-xs font-mono"
      >
        <div
          className="mx-auto drop-shadow-lg grid justify-center w-2/3 bg-white min-w-[680px] h-[200px] rounded-t-lg border-t border-x border-slate-300"
          style={{
            gridTemplateColumns: '1fr 5fr 1fr',
          }}
        >
          <div
            className="flex flex-col bg-[#a6fea6] justify-center items-center cursor-pointer rounded-tl-lg"
            onClick={() => props.onNodeClick(parentElement)}
          >
            {'<'}
            {parentElement.tagName.toLowerCase()}
            {'>'}
            {Array.from(parentElement.classList).map((cls, idx) => {
              return <div key={idx}>{cls}</div>
            })}
          </div>
          <div className="flex flex-col bg-white overflow-y-auto">
            {siblings.map((childElement, idx) => {
              const isSelectedElement = childElement === selectedElement

              return (
                <div
                  key={idx}
                  className="p-4 flex-shrink-0 cursor-pointer min-h-1/4"
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
          <div className="flex flex-col overflow-y-auto bg-[#eeeeee] justify-center items-center rounded-tr-lg">
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
    )
  },
)

function ElementDetails(props: { node: Node }) {
  const { node } = props

  const truncate = (str: string, maxLength: number) => {
    if (str.length <= maxLength) {
      return str
    }

    return str.substring(0, maxLength) + '...'
  }

  if (!(node instanceof HTMLElement)) {
    const text = node.textContent || '<empty string>'
    return <>{truncate(text, 50)}</>
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
    </div>
  )
}

function excludeSwipRoot(element: HTMLElement) {
  return element.id !== 'swip-root'
}
