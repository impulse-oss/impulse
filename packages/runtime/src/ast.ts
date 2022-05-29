import { transform } from '@babel/standalone'
import { NodePath, TraverseOptions } from '@babel/traverse'
import * as t from '@babel/types'
// import prettier from 'prettier'
// import parserBabel from 'prettier/parser-babel'
import { fsGetFileContents, fsWriteToFile, OpenFile } from './fs'
import { FiberSource, getReactFiber } from './react-source'

export type JSXNode = t.JSXElement['children'][0]

export function transformCode(inputCode: string, visitor: TraverseOptions) {
  const transformResult = transform(inputCode, {
    plugins: [{ visitor }],
    parserOpts: {
      sourceType: 'unambiguous',
      plugins: ['typescript', 'jsx'],
    },
    generatorOpts: {
      retainLines: true,
      comments: true,
      retainFunctionParens: true,
    },
  })

  return {
    ...transformResult,
    code: transformResult.code,
    // ? prettier.format(transformResult.code, {
    //     parser: 'babel',
    //     plugins: [parserBabel],
    //   })
    // : transformResult.code,
  }
}

export type TransformResultSuccess<R> = {
  type: 'success'
  file: OpenFile
  code: string
  visitorResult?: R
}

export async function transformNodeInCode<T extends Node, R>(
  domNode: T,
  visitor: T extends HTMLElement
    ? (path: NodePath<t.JSXElement>) => R
    : (path: NodePath<Exclude<JSXNode, t.JSXElement>>) => R,
  dirHandle: FileSystemDirectoryHandle,
): Promise<TransformResultSuccess<R> | { type: 'error' }> {
  const source = (() => {
    if (domNode instanceof HTMLElement) {
      return getReactFiber(domNode)?._debugSource
    }

    if (domNode.parentElement) {
      return getReactFiber(domNode.parentElement)?._debugSource
    }

    return undefined
  })()

  if (!source) {
    return { type: 'error' }
  }

  const file = await fsGetFileContents(dirHandle, source.fileName)
  if (!file) {
    return { type: 'error' }
  }

  const isSourceJsxNode = (path: NodePath<JSXNode>) => {
    const parentJsxElement = path.parentPath.node
    if (parentJsxElement.type !== 'JSXElement') {
      return false
    }

    if (!isSourceJsxElement(parentJsxElement, source)) {
      return false
    }

    const targetJsxNode = findNodeAmongJsxChildren(domNode, parentJsxElement)

    return targetJsxNode === path.node
  }

  let visitorResult: undefined | R = undefined

  const transformResult = transformCode(
    file.text,
    domNode instanceof HTMLElement
      ? {
          JSXElement: (path) => {
            if (!isSourceJsxElement(path.node, source)) {
              return
            }

            visitorResult = (visitor as (path: NodePath<t.JSXElement>) => R)(
              path,
            )
          },
        }
      : {
          JSXText: (path) => {
            if (!isSourceJsxNode(path)) {
              return
            }
            visitorResult = (visitor as (path: NodePath<t.JSXText>) => R)(path)
          },

          JSXFragment: (path) => {
            if (!isSourceJsxNode(path)) {
              return
            }
            visitorResult = (visitor as (path: NodePath<t.JSXFragment>) => R)(
              path,
            )
          },

          JSXExpressionContainer: (path) => {
            if (!isSourceJsxNode(path)) {
              return
            }
            visitorResult = (
              visitor as (path: NodePath<t.JSXExpressionContainer>) => R
            )(path)
          },

          JSXSpreadChild: (path) => {
            if (!isSourceJsxNode(path)) {
              return
            }
            visitorResult = (
              visitor as (path: NodePath<t.JSXSpreadChild>) => R
            )(path)
          },
        },
  )

  return {
    type: 'success',
    file,
    code: transformResult.code!,
    visitorResult,
  }
}

export function writeTransformationResult(
  transformResult: TransformResultSuccess<unknown>,
) {
  return fsWriteToFile(transformResult.file.fileHandle, transformResult.code)
}

export function findNodeAmongJsxChildren(
  domNode: Node,
  parentJsxElement: t.JSXElement,
) {
  const siblings = Array.from(domNode.parentElement!.childNodes) as Node[]
  const indexInsideParent = siblings.indexOf(domNode)

  const targetJsxNode = parentJsxElement!.children.filter((childNode) => {
    // emtpy JSXText nodes don't render anything and thus aren't found among DOM nodes
    if (childNode.type === 'JSXText' && childNode.value.trim().length === 0) {
      return false
    }
    return true
  })[indexInsideParent]

  return targetJsxNode
}

export function isSourceJsxElement(
  node: t.JSXElement,
  fiberSource: FiberSource,
) {
  const loc = node.openingElement.name.loc
  const isTargetTag =
    loc?.start.line === fiberSource.lineNumber &&
    loc?.start.column === fiberSource.columnNumber

  return isTargetTag
}
