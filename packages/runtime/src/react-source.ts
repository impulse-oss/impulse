export type FiberSource = {
  fileName: string
  lineNumber: number
  columnNumber: number
}

export type Fiber = {
  alternate: Fiber | null
  return: Fiber | null
  child: Fiber | null
  sibling: Fiber | null
  stateNode: Node | null
  index: number
  tag: number
  memoizedProps?: { [key: string]: unknown }
  _debugSource?: FiberSource
  _debugOwner?: Fiber
  elementType: string | Function | ElementTypeProvider
  actualStartTime: number
}

export type ElementTypeProvider = {
  $$typeof: Symbol
  _context: {
    Consumer: unknown
    Provider: unknown
  }
  render?: Function & {
    displayName?: string
  }
}

const fiberProxyCache = new WeakMap<Fiber, Fiber>()

export function getReactFiber(element: Node) {
  const key = Object.keys(element).find((key) => {
    return key.startsWith('__reactFiber$')
  })

  if (!key) {
    return null
  }

  const fiber = (element[key as keyof typeof element] ?? null) as Fiber | null

  if (!fiber) {
    return null
  }

  const wrapInProxy = (fiber: Fiber, params: { isAlternate: boolean }): Fiber => {
    const cachedProxy = fiberProxyCache.get(fiber)
    if (cachedProxy) {
      return cachedProxy
    }

    const newProxy = new Proxy(fiber, {
      get(target, prop: keyof Fiber) {
        switch (prop) {
          case '_debugSource':
            if (target.alternate && target.alternate.actualStartTime > target.actualStartTime) {
              return target.alternate?.[prop]
            }
            return target[prop]
          case 'sibling':
          case 'child': {
            if (target[prop]) {
              return wrapInProxy(target[prop]!, { isAlternate: params.isAlternate })
            }
            if (target.alternate?.[prop]) {
              return wrapInProxy(target.alternate[prop]!, { isAlternate: !params.isAlternate })
            }

            return null
          }
          case 'return':
          case 'alternate':
          case '_debugOwner': {
            const node = target[prop]
            return node ? wrapInProxy(node, { isAlternate: params.isAlternate }) : null
          }
        }

        return target[prop]
      },
    })

    fiberProxyCache.set(fiber, newProxy)

    return newProxy
  }

  return wrapInProxy(fiber, { isAlternate: false })
}

export function nodeIsComponentRoot(node: Node): node is HTMLElement {
  const fiber = getReactFiber(node)

  if (!fiber?._debugOwner || !fiber?.return) {
    return false
  }

  return node instanceof HTMLElement && fiber.return === fiber._debugOwner
}

export function nodeGetReactRoot(node: Node) {
  const element = node instanceof Element ? node : node.parentElement
  if (!element) {
    return null
  }

  const fiber = getReactFiber(element)
  if (!fiber) {
    return null
  }

  let result = fiber
  while (result._debugOwner) {
    result = result._debugOwner
  }

  return result
}

export const fiberTags = {
  fragment: 7,
}

function* fiberGetSiblingsGenerator(fiber: Fiber) {
  let sibling = fiber?.return?.child
  while (sibling) {
    yield sibling
    sibling = sibling.sibling
  }
}

export function fiberGetSiblings(fiber: Fiber) {
  return [...fiberGetSiblingsGenerator(fiber)]
}

export function elementGetOwnerWithSource(element: Node) {
  const fiber = getReactFiber(element)

  let currentFiber: Fiber | null = fiber
  while (currentFiber) {
    const ownerSource = currentFiber._debugOwner?._debugSource
    if (ownerSource) {
      return currentFiber._debugOwner ?? null
    }
    currentFiber = currentFiber._debugOwner ?? null
  }

  return null
}
