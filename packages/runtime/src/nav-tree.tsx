import {
  ChevronDownIcon,
  ChevronRightIcon,
  XIcon,
} from '@heroicons/react/solid'
import animatedScrollTo from 'animated-scroll-to'
import assert from 'assert'
import { Ref, useEffect, useMemo, useRef, useState } from 'react'
import {
  Fiber,
  getReactFiber,
  nodeGetReactRoot,
  nodeIsComponentRoot,
} from './react-source'

export type NavTreeNode = {
  children: NavTreeNode[]
} & (NavTreeNodeDom | NavTreeNodeComponent)

export type NavTreeNodeDom = {
  type: 'dom'
  domNode: Node
}

export type NavTreeNodeComponent = {
  type: 'component'
  component: Fiber
}

export type NavTreePanelProps = {
  rootRef: Ref<HTMLDivElement>
  selectedNode: Node
  onNodeClick: (element: NavTreeNode) => void
  onCloseClick: () => void
}

export const NavTreePanel = (props: NavTreePanelProps) => {
  return (
    <div
      ref={props.rootRef}
      className="fixed w-full h-[350px] bottom-0 z-[10050]"
    >
      <NavTreePanelView {...props} />
    </div>
  )
}

export const NavTreePanelView = (props: NavTreePanelProps) => {
  const root = nodeGetReactRoot(props.selectedNode)
  const navTree = useMemo(() => {
    return buildNavTree(root!)
  }, [props.selectedNode])

  const selectedNodeContainerRef = useRef<HTMLDivElement>(null)
  const selectedNodeElementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedNodeElementRef.current || !selectedNodeContainerRef.current) {
      return
    }

    animatedScrollTo(selectedNodeElementRef.current, {
      elementToScroll: selectedNodeContainerRef.current,
      verticalOffset: -selectedNodeContainerRef.current.offsetHeight * 0.25,
    })
  }, [props.selectedNode])

  const [hoveredNodes, setHoveredNodes] = useState<NavTreeNode[]>([])
  const hoveredNode = hoveredNodes[hoveredNodes.length - 1]

  return (
    <div className="bg-theme-bg border-theme-accent/25 flex flex-col h-full">
      <div className="flex shadow-md bg-theme-bg-highlight justify-between">
        <div>
          <button
            type="button"
            className="bg-theme-bg p-2 border-theme-accent border-b-2 px-5"
          >
            Elements
          </button>
        </div>
        <button
          type="button"
          className="w-10 flex justify-center items-center"
          onClick={() => {
            props.onCloseClick()
          }}
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>
      <div ref={selectedNodeContainerRef} className="p-2 overflow-y-auto">
        <NavTreeFromNode
          {...props}
          node={navTree}
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
    </div>
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
    if (node.type !== 'dom') {
      return { type: 'expanded' }
    }

    if (!(node.domNode instanceof Element)) {
      return { type: 'expanded' }
    }

    if (node.domNode === selectedNode || node.domNode.contains(selectedNode)) {
      return { type: 'expanded' }
    }

    return { type: 'collapsed' }
  })()
  // const [state, setState] = useState<State>(initialState)

  const isSelected = node.type === 'dom' && node.domNode === selectedNode
  const isHovered = node === hoveredNode

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
      {(node.type === 'component' ||
        (node.type === 'dom' && node.domNode instanceof Element)) && (
        <div className="w-4 shrink-0 pt-[3px]">
          {state.type === 'collapsed' ? (
            <ChevronRightIcon className="w-full" />
          ) : (
            <ChevronDownIcon className="w-full" />
          )}
        </div>
      )}
      <div
        ref={isSelected ? selectedNodeElementRef : null}
        className={`flex p-px ${isSelected ? 'bg-theme-accent/50' : ''} ${
          isHovered && !isSelected ? 'bg-theme-accent/30' : ''
        }`}
        style={{
          flexDirection: state.type === 'expanded' ? 'column' : 'row',
        }}
      >
        {node.type === 'component' ? (
          (() => {
            const componentName =
              typeof node.component._debugOwner?.elementType === 'function'
                ? node.component._debugOwner.elementType.name
                : 'unknown'
            return (
              <>
                <div className="text-theme-content-opaque">
                  {'<'}
                  {componentName}
                  {'>'}
                </div>
                <div>
                  {state.type === 'expanded'
                    ? node.children.map((child, idx) => (
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
          })()
        ) : (
          <>
            <ElementDetails node={node.domNode} />
            <div>
              {state.type === 'expanded'
                ? node.children.map((child, idx) => (
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
            {node.domNode instanceof Element && (
              <div>
                {'</'}
                <b>{node.domNode.tagName.toLowerCase()}</b>
                {'>'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function buildNavTree(node: Node): NavTreeNode {
  const children = Array.from(node.childNodes)

  const domNode = {
    type: 'dom',
    domNode: node,
    children: children.map((child) => buildNavTree(child)),
  } as const

  if (nodeIsComponentRoot(node)) {
    return {
      type: 'component',
      component: getReactFiber(node)!,
      children: [domNode],
    }
  }
  return domNode
}

function nodeGetParent(node: Node, depth: number): Element {
  assert(depth > 0)
  const firstParent = node.parentElement

  if (!firstParent) {
    if (!(node instanceof Element)) {
      throw new Error(`node is not an element`)
    }
    return node
  }

  let result = firstParent
  for (let i = 0; i < depth - 1; i++) {
    result = result.parentElement ?? result
  }

  return result
}

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
      {Array.from(node.attributes)
        .filter((attribute) => {
          return attribute.name === 'class' && attribute.value !== ''
        })

        .map((attribute, idx) => {
          const attributeValue = (() => {
            if (attribute.name === 'class') {
              return [...node.classList]
                .filter((className) => !className.startsWith('__impulse__'))
                .join(' ')
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
