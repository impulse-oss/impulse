import { Tab } from '@headlessui/react'
import { ChevronDownIcon, ChevronRightIcon, XIcon } from '@heroicons/react/solid'
import animatedScrollTo from 'animated-scroll-to'
import { Fragment, ReactNode, Ref, useEffect, useRef, useState } from 'react'
import packageInfo from '../package.json'
import { Link } from './link'
import { Fiber, fiberGetSiblings, nodeGetReactRoot } from './react-source'

export type NavTreeNode = Fiber | Node

export type NavTreePanelProps = {
  height: number
  rootRef: Ref<HTMLDivElement>
  selectedNode: Node
  onNodeClick: (element: NavTreeNode) => void
  onCloseClick: () => void
  sidePanel?: ReactNode
}

export const NavTreePanel = (props: NavTreePanelProps) => {
  return (
    <div
      ref={props.rootRef}
      className="fixed w-full bottom-0 z-[10050]"
      style={{
        height: props.height,
      }}
    >
      <NavTreePanelView {...props} />
    </div>
  )
}

export function NavTreePanelView(props: NavTreePanelProps) {
  const root = nodeGetReactRoot(props.selectedNode)

  const selectedNodeContainerRef = useRef<HTMLDivElement>(null)
  const selectedNodeElementRef = useRef<HTMLDivElement>(null)

  const scrollToSelectedElement = () => {
    if (!selectedNodeElementRef.current || !selectedNodeContainerRef.current) {
      return
    }

    animatedScrollTo(selectedNodeElementRef.current, {
      elementToScroll: selectedNodeContainerRef.current,
      verticalOffset: -selectedNodeContainerRef.current.offsetHeight * 0.25,
    })
  }

  useEffect(scrollToSelectedElement, [selectedNodeElementRef.current, selectedNodeContainerRef])

  const [hoveredNodes, setHoveredNodes] = useState<NavTreeNode[]>([])
  const hoveredNode = hoveredNodes[hoveredNodes.length - 1]

  const tabs = ['Elements', 'About']

  return (
    <Tab.Group
      onChange={() => {
        setTimeout(scrollToSelectedElement, 1)
      }}
    >
      <div className="flex flex-col h-full bg-theme-bg border-theme-accent/25">
        <div className="flex justify-between shadow-md bg-theme-bg-highlight shrink-0">
          <Tab.List>
            {tabs.map((tabName) => (
              <Tab key={tabName} as={Fragment}>
                {({ selected }) => (
                  <button
                    className={
                      'outline-none py-1 px-5 ' +
                      (selected ? 'border-b-2 border-theme-accent bg-theme-bg' : 'hover:bg-theme-bg/40')
                    }
                  >
                    {tabName}
                  </button>
                )}
              </Tab>
            ))}
          </Tab.List>
          <button
            type="button"
            className="flex items-center justify-center w-10 hover:bg-theme-bg/40"
            onClick={() => {
              props.onCloseClick()
            }}
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <Tab.Panels>
          <Tab.Panel className="flex outline-none" style={{ height: props.height - 50 }}>
            <div ref={selectedNodeContainerRef} className="flex-1 p-2 overflow-auto">
              <NavTreeFromNode
                {...props}
                node={root!}
                level={0}
                selectedNodeElementRef={selectedNodeElementRef}
                hoveredNode={hoveredNode}
                onNodeMouseEnter={(node) => {
                  setHoveredNodes((nodes) => {
                    return [...nodes, node]
                  })
                }}
                onNodeMouseLeave={(node) => {
                  setHoveredNodes((nodes) => {
                    return nodes.filter((n) => n !== node)
                  })
                }}
              />
            </div>
            <div className="max-w-[400px] shrink-0">{props.sidePanel}</div>
          </Tab.Panel>
          <Tab.Panel className="p-4">
            <p>
              Version:{' '}
              {(() => {
                return packageInfo.version
              })()}
            </p>
            <p>
              Github:{' '}
              <Link target="_blank" href="https://github.com/impulse-oss/impulse">
                impulse-oss/impulse
              </Link>
            </p>
            <p>
              Discord:{' '}
              <Link target="_blank" href="https://discord.gg/nDDCyyedbs">
                Join
              </Link>
            </p>
            <p className="mt-4">
              Made by{' '}
              <Link target="_blank" href="https://twitter.com/krogovoy">
                @krogovoy
              </Link>{' '}
              and{' '}
              <Link target="_blank" href="https://twitter.com/IVolchenskov">
                @IVolchenskov
              </Link>
            </p>
          </Tab.Panel>
        </Tab.Panels>
      </div>
    </Tab.Group>
  )
}

export function NavTreeFromNode({
  node,
  level,
  selectedNode,
  hoveredNode,
  onNodeClick,
  onNodeMouseEnter,
  onNodeMouseLeave,
  selectedNodeElementRef,
}: {
  node: NavTreeNode
  level: number
  selectedNode: Node
  hoveredNode: NavTreeNode | null
  onNodeClick: (node: NavTreeNode) => void
  onNodeMouseEnter: (node: NavTreeNode) => void
  onNodeMouseLeave: (node: NavTreeNode) => void
  selectedNodeElementRef: Ref<HTMLDivElement>
}) {
  type State = {
    type: 'collapsed' | 'expanded'
  }
  const state: State = (() => {
    if (node instanceof Node) {
      return { type: 'expanded' }
    }
    if (typeof node.elementType === 'function') {
      return { type: 'expanded' }
    }

    if (typeof node.elementType === 'object') {
      return { type: 'expanded' }
    }

    const domNode = node.stateNode!

    if (!(domNode instanceof Element)) {
      return { type: 'expanded' }
    }

    if (domNode === selectedNode || domNode.contains(selectedNode)) {
      return { type: 'expanded' }
    }

    return { type: 'collapsed' }
  })()

  const isSelected = node instanceof Node ? node === selectedNode : node.stateNode === selectedNode
  const isHovered = node === hoveredNode

  const chevron = (() => {
    if (node instanceof Node) {
      return <div className="w-4"></div>
    }

    const isJsxElement = typeof node.elementType === 'function' || node.tag === 11
    const isHtmlElement = typeof node.elementType === 'string' && node.stateNode instanceof Element

    if (isJsxElement || isHtmlElement) {
      return (
        <div className="w-4 shrink-0 pt-[3px]">
          {state.type === 'collapsed' ? (
            <ChevronRightIcon className="w-full" />
          ) : (
            <ChevronDownIcon className="w-full" />
          )}
        </div>
      )
    }

    return null
  })()

  return (
    <div
      className="flex font-mono text-sm cursor-pointer"
      onClick={(e) => {
        e.stopPropagation()
        onNodeClick(node)
      }}
      onMouseEnter={() => {
        onNodeMouseEnter(node)
      }}
      onMouseLeave={() => {
        onNodeMouseLeave(node)
      }}
    >
      {chevron}
      <div
        ref={isSelected ? selectedNodeElementRef : null}
        className={`flex p-px ${isSelected ? 'bg-theme-accent/50' : ''} ${
          isHovered && !isSelected ? 'bg-theme-accent/30' : ''
        }`}
        style={{
          flexDirection: state.type === 'expanded' ? 'column' : 'row',
        }}
      >
        {(() => {
          // node is a text Node
          if (node instanceof Node) {
            return (
              <>
                {'"'}
                {node.nodeValue}
                {'"'}
              </>
            )
          }

          const fiberChild = node.child
          const children = fiberChild ? fiberGetSiblings(fiberChild) : [...(node.stateNode?.childNodes ?? [])]

          // node is a React component
          if (typeof node.elementType === 'function') {
            const componentName = node.elementType.name ?? 'UnknownComponent'

            return (
              <>
                <div className="text-theme-content-opaque">
                  {'<'}
                  {componentName}
                  {'>'}
                </div>
                <div>
                  {state.type === 'expanded'
                    ? children.map((child, idx) => (
                        <NavTreeFromNode
                          key={idx}
                          node={child}
                          level={level + 4}
                          {...{
                            selectedNode,
                            hoveredNode,
                            onNodeClick,
                            onNodeMouseEnter,
                            onNodeMouseLeave,
                            selectedNodeElementRef,
                          }}
                        />
                      ))
                    : '...'}
                </div>
                <div className="text-theme-content-opaque">
                  {'</'}
                  {componentName}
                  {'>'}
                </div>
              </>
            )
          }

          // node is an HTML element
          if (typeof node.elementType === 'string') {
            return (
              <>
                <ElementDetails node={node.stateNode!} />
                <div>
                  {state.type === 'expanded'
                    ? children.map((child, idx) => (
                        <NavTreeFromNode
                          key={idx}
                          node={child}
                          level={level + 4}
                          {...{
                            selectedNode,
                            hoveredNode,
                            onNodeClick,
                            onNodeMouseEnter,
                            onNodeMouseLeave,
                            selectedNodeElementRef,
                          }}
                        />
                      ))
                    : '...'}
                </div>
                {node.stateNode instanceof Element && (
                  <div>
                    {'</'}
                    <b>{node.stateNode.tagName.toLowerCase()}</b>
                    {'>'}
                  </div>
                )}
              </>
            )
          }

          // node is a text Node with Fiber
          if (node.elementType === null && node.stateNode instanceof Node) {
            return (
              <>
                {'"'}
                {node.stateNode.nodeValue!}
                {'"'}
              </>
            )
          }

          // node is a forward ref
          if (node.tag === 11 && typeof node.elementType === 'object' && node.elementType.render) {
            const componentName =
              node.elementType.render.displayName || node.elementType.render.name || 'UnknownComponent'

            return (
              <>
                <div className="text-theme-content-opaque">
                  {'<'}
                  {componentName}
                  {'>'}
                </div>
                <div>
                  {state.type === 'expanded'
                    ? children.map((child, idx) => (
                        <NavTreeFromNode
                          key={idx}
                          node={child}
                          level={level + 4}
                          {...{
                            selectedNode,
                            hoveredNode,
                            onNodeClick,
                            onNodeMouseEnter,
                            onNodeMouseLeave,
                            selectedNodeElementRef,
                          }}
                        />
                      ))
                    : '...'}
                </div>
                <div className="text-theme-content-opaque">
                  {'</'}
                  {componentName}
                  {'>'}
                </div>
              </>
            )
          }

          // node is a context provider or fragment or something else
          if (typeof node.elementType === 'object') {
            return (
              <>
                {state.type === 'expanded'
                  ? children.map((child, idx) => (
                      <NavTreeFromNode
                        key={idx}
                        node={child}
                        level={level + 4}
                        {...{
                          selectedNode,
                          hoveredNode,
                          onNodeClick,
                          onNodeMouseEnter,
                          onNodeMouseLeave,
                          selectedNodeElementRef,
                        }}
                      />
                    ))
                  : '...'}
              </>
            )
          }
          return null
        })()}
      </div>
    </div>
  )
}

function ElementDetails(props: { node: Node }) {
  const { node } = props

  const truncate = (str: string, maxLength: number) => {
    if (str.length <= maxLength) {
      return str
    }

    return str.substring(0, maxLength) + '...'
  }

  if (!(node instanceof Element)) {
    const text = node.textContent || '<empty string>'
    return <>"{truncate(text, 50)}"</>
  }

  return (
    <div>
      {'<'}
      <b>{node.tagName.toLocaleLowerCase()}</b>
      {Array.from(node.attributes)
        .filter((attribute) => {
          if (attribute.name !== 'class') {
            return false
          }

          if (attribute.value.trim() === '') {
            return false
          }

          const classes = attribute.value
            .split(' ')
            .map((x) => x.trim())
            .filter((className) => !className.startsWith('__impulse__'))

          if (classes.length === 0) {
            return false
          }

          return true
        })

        .map((attribute, idx) => {
          const attributeValue = (() => {
            if (attribute.name === 'class') {
              return [...node.classList].filter((className) => !className.startsWith('__impulse__')).join(' ')
            }

            return attribute.value
          })()

          return (
            <span key={attribute.name + idx}>
              {' '}
              <span className="whitespace-nowrap">{attribute.name}</span>=
              <span className={'text-theme-blue'}>"{attributeValue}"</span>
            </span>
          )
        })}
      {'>'}
    </div>
  )
}
