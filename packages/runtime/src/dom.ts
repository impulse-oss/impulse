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
