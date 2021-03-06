import * as indexDb from 'idb-keyval'
import postcss, { Declaration, Rule } from 'postcss'
import { useEffect, useRef } from 'react'
import tailwind, { Config as TailwindConfig } from 'tailwindcss'

export type TailwindClasses = {
  [key: string]: TailwindClassDescription
}

export type TailwindClassDescription = {
  nodes: {
    prop: string
    value: string
  }[]
}

export function useTailwind(params: { tailwindConfig: TailwindConfig }) {
  const { tailwindConfig } = params
  const tailwindClassesRef = useRef<TailwindClasses>({})

  useEffect(() => {
    ;(async () => {
      const tailwindConfigHash = JSON.stringify(tailwindConfig)
      const tailiwndConfigHashCached = (await indexDb.get(
        'tailwindConfigHashCached',
      )) as string

      if (tailiwndConfigHashCached === tailwindConfigHash) {
        tailwindClassesRef.current = (await indexDb.get(
          'tailwindClassesCache',
        ))!

        return
      }

      const postcssResult = postcss([
        tailwind({
          content: [],
          safelist: [{ pattern: /.*/, variants: [] }],
          corePlugins: {
            preflight: false,
          },
          theme: {},
          plugins: [],
        }),
      ]).process(
        `
          @tailwind base;
          @tailwind components;
          @tailwind utilities;
          `,
      )

      const tailwindClasses = Object.fromEntries(postcssResult.root.nodes
        .filter((node) => {
          const singleClassSelectorRegex = /^\.\S+$/
          return node.type === 'rule' && node.selector.match(singleClassSelectorRegex)
        })
        .map((rule) => {
          rule = rule as Rule
          return [
            rule.selector,
            {
              nodes: rule.nodes
                .filter((node) => {
                  return node.type === 'decl'
                })
                .map((decl) => {
                  decl = decl as Declaration
                  return { prop: decl.prop, value: decl.value }
                }),
            },
          ]
        }))
      console.log('postcssResult', tailwindClasses)

      tailwindClassesRef.current = tailwindClasses
      await indexDb.set('tailwindConfigHashCached', tailwindConfigHash)
      await indexDb.set('tailwindClassesCache', tailwindClasses)
    })()
  }, [])

  return {
    tailwindClasses: tailwindClassesRef.current,
  }
}
