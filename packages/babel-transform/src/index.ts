import { PluginObj, types } from 'babel-core'
import { NodePath } from 'babel-traverse'
import { Program } from 'babel-types'

export default function babelTransform(babel: {
  types: typeof types
}): PluginObj {
  const t = babel.types

  return {
    visitor: {
      JSXElement(path, state) {
        const openingElement = path.node.openingElement

        if (
          openingElement.name.type === 'JSXIdentifier' &&
          (openingElement.name.name.toLowerCase() !==
            openingElement.name.name ||
            openingElement.name.name.length === 0)
        ) {
          return
        }

        if (!path.node?.openingElement?.loc) {
          return
        }
        const payload = {
          f: state.file.opts.filename,
          l: openingElement.loc.end.line,
          c: openingElement.loc.end.column,
        }
        openingElement.attributes.push(
          t.jSXAttribute(
            t.jSXIdentifier('data-source'),
            t.stringLiteral(JSON.stringify(payload)),
          ),
        )

        // openingElement.attributes.push(
        //   t.jSXAttribute(
        //     t.jSXIdentifier('data-stack'),
        //     t.jSXExpressionContainer(parse('new Error().stack').program.body[0].expression),
        //   ),
        // )
      },
      Program: {
        exit(path: NodePath<Program>) {
          // path.node.body.push(
          //   t.expressionStatement(
          //     t.callExpression(t.identifier('require'), [
          //       t.stringLiteral('swip/runtime'),
          //     ]),
          //   ),
          // )
        },
      },
    },
  }
}
