import * as t from '@babel/types'
import { SelectionState } from './app'
import { transformNodeInCode, writeTransformationResultToFile, JSXNode, isNotEmptyNode } from './ast'
import { waitForAnyNodeMutation } from './dom'
import { useDirHandle } from './fs'
import { warn } from './logger'
import { nodeIsComponentRoot } from './react-source'
import { undoLatestChange } from './undo'

export function makeTransformers(params: {
  getDirHandle: ReturnType<typeof useDirHandle>['getDirHandle']
  prettierConfig: any
  selectionState: SelectionState
  setSelectedNode: (node: Node) => void
}) {
  const { getDirHandle, prettierConfig, selectionState, setSelectedNode } = params
  const addClass = async (
    selectedElement: Element,
    classNameToAdd: string,
    classesToRemove: string[] = [],
  ) => {
    const cWarn = (...messages: any) => {
      return warn('addClass', ...messages)
    }

    const transformResult = await transformNodeInCode(
      selectedElement,
      ({ node }) => {
        const attributes = node.openingElement.attributes

        const existingClassNameAttribute = attributes.find(
          (attribute) => attribute.type === 'JSXAttribute' && attribute.name.name === 'className',
        ) as t.JSXAttribute

        if (existingClassNameAttribute) {
          const classNameAttrValue = existingClassNameAttribute.value
          if (classNameAttrValue?.type !== 'StringLiteral') {
            cWarn(
              'removeClass: className attribute is not a string literal, but rather a',
              classNameAttrValue?.type,
            )
            return
          }

          const classList = classNameAttrValue.value.split(' ')
          if (classList.includes(classNameToAdd)) {
            return
          }

          // replace the old class with the new class without losing the position
          if (classesToRemove.length === 1) {
            const classToRemove = classesToRemove[0]
            existingClassNameAttribute.value = t.stringLiteral(
              classList
                .map((className) => {
                  if (className === classToRemove) {
                    return classNameToAdd
                  }
                  return className
                })
                .join(' ')
                .trim(),
            )
          } else {
            classList.push(classNameToAdd)

            existingClassNameAttribute.value = t.stringLiteral(
              classList
                .filter((className) => !classesToRemove.includes(className))
                .join(' ')
                .trim(),
            )
          }

          return
        }

        const className = t.jsxAttribute(t.jsxIdentifier('className'), t.stringLiteral(classNameToAdd))

        attributes.push(className)
      },
      await getDirHandle({ mode: 'readwrite' }),
      { preferAncestor: 'none', prettierConfig },
    )

    if (transformResult.type === 'error') {
      return
    }

    selectedElement.classList.add(classNameToAdd)
    await writeTransformationResultToFile(transformResult)
  }

  const removeClass = async (selectedElement: Element, classNameToRemove: string) => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      ({ node }) => {
        const cWarn = (...messages: any) => {
          return warn('removeClass', ...messages)
        }
        const attributes = node.openingElement.attributes

        const existingClassNameAttribute = attributes.find(
          (attribute) => attribute.type === 'JSXAttribute' && attribute.name.name === 'className',
        ) as t.JSXAttribute

        if (!existingClassNameAttribute) {
          cWarn('removeClass: no className attribute found')
          return
        }

        const classNameAttrValue = existingClassNameAttribute.value
        if (classNameAttrValue?.type !== 'StringLiteral') {
          cWarn(
            'removeClass: className attribute is not a string literal, but rather a',
            classNameAttrValue?.type,
          )
          return
        }

        const classList = classNameAttrValue.value.trim().split(' ')
        const newClassList = classList.filter((className) => className !== classNameToRemove)

        if (newClassList.length === 0) {
          node.openingElement.attributes = attributes.filter((attribute) => {
            if (attribute.type !== 'JSXAttribute') {
              return true
            }

            return attribute.name.name !== existingClassNameAttribute.name.name
          })
          return
        }

        existingClassNameAttribute.value = t.stringLiteral(newClassList.join(' '))
      },
      await getDirHandle({ mode: 'readwrite' }),
      { preferAncestor: 'none', prettierConfig },
    )

    if (transformResult.type === 'error') {
      return
    }

    await writeTransformationResultToFile(transformResult)
  }

  const removeNode = async (selectedElement: Node) => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      (path) => {
        path.remove()
      },
      await getDirHandle({ mode: 'readwrite' }),
      {
        prettierConfig,
        preferAncestor: nodeIsComponentRoot(selectedElement) ? 'owner' : 'parent',
      },
    )

    if (transformResult.type === 'error') {
      return
    }

    if (!(selectedElement instanceof Element)) {
      await writeTransformationResultToFile(transformResult)
      return
    }

    // const oldDisplay = selectedElement.style.display

    // selectedElement.__impulseHide = true
    // selectedElement.style.display = 'none'
    // onSelectedElementRemoved()

    await writeTransformationResultToFile(transformResult)

    await waitForAnyNodeMutation(selectedElement)

    // selectedElement.style.display = oldDisplay
    // if (selectedElement.getAttribute('style') === '') {
    //   selectedElement.removeAttribute('style')
    // }
    // selectedElement.__impulseHide = false
  }

  const insertBeforeNode = async (selectedElement: Node, jsxNodeToInsert: JSXNode) => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      (path) => {
        path.insertBefore(jsxNodeToInsert)
      },
      await getDirHandle({ mode: 'readwrite' }),
      { prettierConfig },
    )

    if (transformResult.type === 'error') {
      return
    }

    await writeTransformationResultToFile(transformResult)
  }

  const insertAfterNode = async (selectedElement: Node, jsxNodeToInsert: JSXNode) => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      (path) => {
        path.insertAfter(jsxNodeToInsert)
      },
      await getDirHandle({ mode: 'readwrite' }),
      { prettierConfig },
    )

    if (transformResult.type === 'error') {
      return
    }

    await writeTransformationResultToFile(transformResult)

    await waitForAnyNodeMutation(selectedElement)

    if (selectedElement.nextSibling) {
      setSelectedNode(selectedElement.nextSibling!)
    }
  }

  const insertChild = async (selectedElement: Element, jsxNodeToInsert: JSXNode) => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      (path) => {
        path.node.children.push(jsxNodeToInsert)
      },
      await getDirHandle({ mode: 'readwrite' }),
      { prettierConfig },
    )

    if (transformResult.type === 'error') {
      return
    }

    await writeTransformationResultToFile(transformResult)

    await waitForAnyNodeMutation(selectedElement)

    if (selectedElement.lastChild) {
      setSelectedNode(selectedElement.lastChild)
    }
  }

  const changeTag = async (selectedElement: Element, newTagName: typeof htmlTags[0]) => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      (path) => {
        if (path.node.openingElement.name.type !== 'JSXIdentifier') {
          return
        }
        path.node.openingElement.name.name = newTagName.toLowerCase()

        if (path.node.closingElement?.name.type === 'JSXIdentifier') {
          path.node.closingElement.name.name = newTagName.toLowerCase()
        }
      },
      await getDirHandle({ mode: 'readwrite' }),
      { prettierConfig },
    )

    if (transformResult.type === 'error') {
      return
    }

    await writeTransformationResultToFile(transformResult)

    await waitForAnyNodeMutation(selectedElement)
  }

  const moveNode = async (selectedElement: Node, direction: 'up' | 'down') => {
    const transformResult = await transformNodeInCode(
      selectedElement,
      (path) => {
        const parent = path.parentPath.node
        if (parent.type !== 'JSXElement' && parent.type !== 'JSXFragment') {
          return
        }

        const children = parent.children.filter(isNotEmptyNode)

        const index = children.indexOf(path.node)
        const siblingIndex = direction === 'up' ? index - 1 : index + 1
        const sibling = children[siblingIndex]
        if (!sibling) {
          return
        }

        ;[children[index], children[siblingIndex]] = [children[siblingIndex], children[index]]
        parent.children = children
      },
      await getDirHandle({ mode: 'readwrite' }),
      {
        preferAncestor: nodeIsComponentRoot(selectedElement) ? 'owner' : 'parent',
        prettierConfig,
      },
    )

    if (transformResult.type === 'error') {
      return
    }

    const parent = selectedElement.parentElement
    if (!parent) {
      return
    }

    if (selectionState.type !== 'elementSelected') {
      return
    }

    const newChildIndex = selectionState.indexInsideParent + (direction === 'up' ? -1 : 1)

    await writeTransformationResultToFile(transformResult)
    await waitForAnyNodeMutation(selectedElement)

    const sibling = parent.childNodes[newChildIndex]
    if (sibling) {
      setSelectedNode(sibling)
    }
  }

  const tryToUndoLatestChange = async () => {
    undoLatestChange(await getDirHandle({ mode: 'readwrite' }))
  }

  return {
    addClass,
    removeClass,
    removeNode,
    insertBeforeNode,
    insertAfterNode,
    insertChild,
    changeTag,
    moveNode,
    tryToUndoLatestChange,
  }
}

const htmlTags = [
  'a',
  'abbr',
  'address',
  'area',
  'article',
  'aside',
  'audio',
  'b',
  'base',
  'bdi',
  'bdo',
  'blockquote',
  'body',
  'br',
  'button',
  'canvas',
  'caption',
  'cite',
  'code',
  'col',
  'colgroup',
  'data',
  'datalist',
  'dd',
  'del',
  'details',
  'dfn',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'em',
  'embed',
  'fieldset',
  'figcaption',
  'figure',
  'font',
  'footer',
  'form',
  'frame',
  'frameset',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hgroup',
  'hr',
  'html',
  'i',
  'iframe',
  'img',
  'input',
  'ins',
  'kbd',
  'label',
  'legend',
  'li',
  'link',
  'main',
  'map',
  'mark',
  'marquee',
  'menu',
  'meta',
  'meter',
  'nav',
  'noscript',
  'object',
  'ol',
  'optgroup',
  'option',
  'output',
  'p',
  'param',
  'picture',
  'pre',
  'progress',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'script',
  'section',
  'select',
  'slot',
  'small',
  'source',
  'span',
  'strong',
  'style',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'template',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'time',
  'title',
  'tr',
  'track',
  'u',
  'ul',
  'var',
  'video',
  'wbr',
]
