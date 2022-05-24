import { transform } from '@babel/standalone'
import { TraverseOptions } from '@babel/traverse'
import * as t from '@babel/types'
import { FiberSource } from './react-source'

export function transformCode(inputCode: string, visitor: TraverseOptions) {
  return transform(inputCode, {
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
