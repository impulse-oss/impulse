import { BabelFileResult } from '@babel/core'
import type { NodePath, TraverseOptions } from '@babel/traverse'
import * as t from '@babel/types'
import { transform as cmTransform } from '@codemod/core'
import prettier from 'prettier'
import parserBabel from 'prettier/parser-babel'
import { fsGetFileContents, fsWriteToFile, OpenFile } from './fs'
import { warn } from './logger'
import { elementGetOwnerWithSource, fiberGetSiblings, FiberSource, getReactFiber } from './react-source'
import { undoFileOnChange } from './undo'

export type JSXNode = t.JSXElement['children'][0]

export type TransformResult = TransformResultSuccess | TransformResultError
export type TransformResultSuccess = {
  type: 'success'
  babelResult: BabelFileResult
}
export type TransformResultError = {
  type: 'error'
  error: Error
}

export function transformCode(inputCode: string, visitor: TraverseOptions): TransformResult {
  try {
    const babelResult = cmTransform(inputCode, {
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
      type: 'success',
      babelResult,
    }
  } catch (e) {
    warn('code transformation error', e)
    return { type: 'error', error: e as Error }
  }
}

export type TransformNodeResultSuccess<R> = {
  type: 'success'
  file: OpenFile
  code: string
  visitorResult?: R
}

export async function transformNodeInCode<T extends Node, R>(
  domNode: T,
  visitor: (path: NodePath<T extends Element ? t.JSXElement : JSXNode>) => R,
  dirHandle: FileSystemDirectoryHandle,
  options?: {
    preferAncestor?: 'parent' | 'owner' | 'none'
    prettierConfig?: prettier.Options
  },
): Promise<TransformNodeResultSuccess<R> | { type: 'error' }> {
  const preferAncestor = options?.preferAncestor ?? 'parent'
  const fiber = getReactFiber(domNode)
  const source = fiber?._debugSource

  const сWarn = (...messages: any) => {
    return warn('transformNodeInCode', { fiber, source }, ...messages)
  }

  domNode.__impulseDirty = true
  if (!domNode.parentElement) {
    сWarn('domNode.parentElement is null')
    return { type: 'error' }
  }

  const parentFiber = fiber?.return
  const isExternalComponent = !source && fiber?._debugOwner
  const shouldLookForOwner = isExternalComponent || preferAncestor === 'owner'

  const parentElementFiber = getReactFiber(domNode.parentElement)
  const parentElementSource = parentElementFiber?._debugSource

  const targetNodeFileName = source?.fileName ?? parentElementSource?.fileName

  const ownerFileName =
    elementGetOwnerWithSource(domNode)?._debugSource?.fileName ??
    elementGetOwnerWithSource(domNode.parentElement)?._debugSource?.fileName

  const fileSrc = shouldLookForOwner ? ownerFileName : targetNodeFileName ?? ownerFileName

  if (!fileSrc) {
    сWarn('could not detect the file source path')
    return { type: 'error' }
  }

  const file = await fsGetFileContents(dirHandle, fileSrc)
  if (!file) {
    сWarn('could not open file', fileSrc)
    return { type: 'error' }
  }

  const ownerWithSource =
    elementGetOwnerWithSource(domNode) ?? elementGetOwnerWithSource(domNode.parentElement)

  const isSourceJsxNode = (path: NodePath<JSXNode>) => {
    // regular JSXElement: rely on its fiber's source
    if (domNode instanceof Element) {
      if (preferAncestor === 'none') {
        return source && path.isJSXElement() && isSourceJsxElement(path.node, file.text, source)
      }

      if (shouldLookForOwner) {
        return (
          ownerWithSource?._debugSource &&
          path.isJSXElement() &&
          isSourceJsxElement(path.node, file.text, ownerWithSource._debugSource)
        )
      }

      return source && path.isJSXElement() && isSourceJsxElement(path.node, file.text, source)
    }

    // text node is the only child - and it doesn't have a fiber
    if (!(domNode instanceof Element) && !fiber && parentElementFiber) {
      if (!path.parentPath.isJSXElement()) {
        return false
      }

      const props = parentElementFiber.memoizedProps ?? {}
      const children = props.children

      if (typeof children !== 'string') {
        return false
      }

      const parentOwner = parentElementFiber?._debugOwner?._debugSource
        ? parentElementFiber._debugOwner
        : ownerWithSource

      // the text node is the child of a component
      if (parentOwner?._debugSource && parentOwner.memoizedProps?.children === children) {
        return isSourceJsxElement(path.parentPath.node, file.text, parentOwner._debugSource)
      }

      if (
        parentElementFiber._debugSource &&
        isSourceJsxElement(path.parentPath.node, file.text, parentElementFiber._debugSource)
      ) {
        return true
      }
    }

    // text node inside a fragment - find the grand parent
    const foundTextInsideFragment = (() => {
      if (!fiber) {
        return false
      }
      const parentFiber = fiber.return
      if (!parentFiber) {
        return false
      }

      const parentPath = path.parentPath
      if (!parentPath.isJSXFragment()) {
        return false
      }

      const fiberSiblings = fiberGetSiblings(fiber)

      const fiberElementSibling = fiberSiblings.find((fiber) => fiber.stateNode instanceof Element)

      if (fiberElementSibling) {
        const siblingSource = fiberElementSibling._debugSource
        if (!siblingSource) {
          return false
        }

        const siblingJsxElement = parentPath.node.children.filter(isNotEmptyNode)[fiberElementSibling.index]
        if (
          siblingJsxElement?.type !== 'JSXElement' ||
          !isSourceJsxElement(siblingJsxElement, file.text, siblingSource)
        ) {
          return false
        }

        const targetJsxElement = parentPath.node.children.filter(isNotEmptyNode)[fiber.index]
        if (path.node !== targetJsxElement) {
          return false
        }

        return true
      }

      const grandParentFiber = parentFiber.return
      const grandParentSource = grandParentFiber?._debugSource
      const grandParentPath = parentPath.parentPath
      if (!grandParentPath.isJSXElement()) {
        return false
      }

      if (!grandParentSource) {
        return false
      }

      if (!isSourceJsxElement(grandParentPath.node, file.text, grandParentSource)) {
        return false
      }

      if (grandParentPath.node.children.filter(isNotEmptyNode)[parentFiber.index] !== path.parentPath.node) {
        return false
      }

      if (parentPath.node.children.filter(isNotEmptyNode)[fiber.index] !== path.node) {
        return false
      }

      return true
    })()

    if (foundTextInsideFragment) {
      return true
    }

    const parentPath = path.parentPath
    if (!parentPath.isJSXElement()) {
      return false
    }

    if (
      !parentFiber?._debugSource ||
      !isSourceJsxElement(parentPath.node, file.text, parentFiber._debugSource)
    ) {
      return false
    }

    const targetJsxNode = findNodeAmongJsxChildren(domNode, parentPath.node)

    return targetJsxNode === path.node
  }

  let visitorHasBeenCalled = false
  let visitorResult: undefined | R = undefined
  const visitorOnce = (path: NodePath<T extends Element ? t.JSXElement : JSXNode>) => {
    if (visitorHasBeenCalled) {
      warn('mathched more than one node', domNode, path)
      return visitorResult
    }

    visitorHasBeenCalled = true

    return visitor(path)
  }

  const transformResult = transformCode(
    file.text,
    domNode instanceof Element
      ? {
          JSXElement: (path) => {
            if (!isSourceJsxNode(path)) {
              return
            }
            visitorResult = (visitorOnce as (path: NodePath<t.JSXElement>) => R)(path)
          },
        }
      : {
          JSXText: (path) => {
            if (!isSourceJsxNode(path)) {
              return
            }
            visitorResult = (visitorOnce as (path: NodePath<t.JSXText>) => R)(path)
          },

          JSXFragment: (path) => {
            if (!isSourceJsxNode(path)) {
              return
            }
            visitorResult = (visitorOnce as (path: NodePath<t.JSXFragment>) => R)(path)
          },

          JSXExpressionContainer: (path) => {
            if (!isSourceJsxNode(path)) {
              return
            }
            visitorResult = (visitorOnce as (path: NodePath<t.JSXExpressionContainer>) => R)(path)
          },

          JSXSpreadChild: (path) => {
            if (!isSourceJsxNode(path)) {
              return
            }
            visitorResult = (visitorOnce as (path: NodePath<t.JSXSpreadChild>) => R)(path)
          },
        },
  )

  if (transformResult.type === 'error') {
    return { type: 'error' }
  }

  if (!visitorHasBeenCalled) {
    warn('no node matched', domNode, file)
    return { type: 'error' }
  }

  const prettierConfig = options?.prettierConfig

  const unformattedCode = transformResult.babelResult.code!
  const formattedCode = prettierConfig
    ? prettier.format(unformattedCode, {
        ...prettierConfig,
        parser: 'babel-ts',
        plugins: [parserBabel],
      })
    : unformattedCode

  return {
    type: 'success',
    file,
    code: formattedCode,
    visitorResult,
  }
}

export function writeTransformationResultToFile(transformResult: TransformNodeResultSuccess<unknown>) {
  undoFileOnChange(transformResult.file.path, transformResult.file.text, transformResult.code)
  return fsWriteToFile(transformResult.file.fileHandle, transformResult.code)
}

function findNodeAmongJsxChildren(domNode: Node, parentJsxElement: t.JSXElement) {
  const fiber = getReactFiber(domNode)
  const fiberParent = fiber?.return
  if (!fiber || !fiberParent) {
    return
  }

  const indexInsideParent = fiber.index

  const targetJsxNode = parentJsxElement!.children.filter(isNotEmptyNode)[indexInsideParent]

  return targetJsxNode
}

function isSourceJsxElement(node: t.JSXElement, fileText: string, fiberSource: FiberSource) {
  const tagLoc = node.openingElement.loc
  const nameLoc = node.openingElement.name.loc

  // we use recast (as codemod dep) for code transformations
  // we use react fibers for getting source information from html elements
  // both (!) produce wrong source information when the source file uses tabs
  //
  // read here more on recase: https://github.com/benjamn/recast/issues/683
  const lineStartsWithTabs = (() => {
    if (!tagLoc?.start) {
      return false
    }

    const lines = fileText.split('\n')
    const line = lines[tagLoc.start.line - 1]

    return line.startsWith('\t')
  })()

  const matchesWithFiber = (loc: t.SourceLocation | null | undefined) => {
    if (!loc) {
      return false
    }

    // if file uses tabs, recase parses 1 tab into 4 spaces internally
    const fileSourceColumn = loc.start.column / (lineStartsWithTabs ? 4 : 1)
    // and react fiber counts each tab as 1 point but always adds +1 (don't know why)
    const fiberSourceColumn = fiberSource.columnNumber - (lineStartsWithTabs ? 1 : 0)

    return loc.start.line === fiberSource.lineNumber && fileSourceColumn === fiberSourceColumn
  }

  const matchesWithTagStart = matchesWithFiber(tagLoc)

  const matchesWithTagNameStart = matchesWithFiber(nameLoc)

  const isTargetTag = matchesWithTagStart || matchesWithTagNameStart

  return isTargetTag
}

export function isNotEmptyNode(node: JSXNode) {
  if (node.type === 'JSXText' && node.value.trim().length === 0) {
    return false
  }

  if (node.type === 'JSXExpressionContainer' && node.expression.type === 'JSXEmptyExpression') {
    return false
  }

  return true
}
