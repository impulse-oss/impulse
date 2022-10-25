export function elementGetAbsolutePosition(node: Node) {
  const rect =
    node instanceof Element
      ? node.getBoundingClientRect()
      : (() => {
          const range = document.createRange()
          range.selectNode(node)
          const rect = range.getBoundingClientRect()
          range.detach()
          return rect
        })()

  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height,
  }
}

export function observeNode(element: Node, callback: MutationCallback) {
  const observer = new MutationObserver(callback)
  observer.observe(element, {
    attributes: true,
    childList: true,
    subtree: true,
  })

  let parentObserver: MutationObserver | null = null
  if (element.parentElement) {
    parentObserver = new MutationObserver(callback)
    parentObserver.observe(element.parentElement, {
      childList: true,
    })
  }

  return { observer, parentObserver }
}

export function waitForAnyNodeMutation(element: Node) {
  return new Promise<void>((resolve) => {
    const observers = observeNode(element, () => {
      observers.observer.disconnect()
      observers.parentObserver?.disconnect()
      resolve()
    })
  })
}
