export function elemenentToString(element: HTMLElement) {
  return `<${element.tagName.toLocaleLowerCase()} ${Array.from(
    element.attributes,
  )
    .map((attribute) => `${attribute.name}="${attribute.value}"`)
    .join(' ')}>`
}

export function elementGetAbsolutePosition(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height,
  }
}

export function observeElement(element: HTMLElement, callback: MutationCallback) {
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

  return {observer, parentObserver}
}
