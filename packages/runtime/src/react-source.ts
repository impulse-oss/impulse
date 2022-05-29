export type FiberSource = {
  fileName: string
  lineNumber: number
  columnNumber: number
}

export type Fiber = {
  return: Fiber | null
  stateNode: Node | null
  _debugSource: FiberSource
}

export function getReactFiber(element: Node) {
  const key = Object.keys(element).find((key) => {
    return key.startsWith('__reactFiber$')
  })

  if (!key) {
    return null
  }

  const domFiber = element[key as keyof typeof element] as unknown as
    | Fiber
    | undefined

  return domFiber
}
