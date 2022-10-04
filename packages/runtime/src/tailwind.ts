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
      const tailiwndConfigHashCached = await indexDb.get<string>('tailwindConfigHashCached')

      const tailwindClassesCached = await indexDb.get('tailwindClassesCache')
      if (tailiwndConfigHashCached === tailwindConfigHash && tailwindClassesCached) {
        tailwindClassesRef.current = tailwindClassesCached
        return
      }

      const postcssResult = postcss([
        tailwind({
          content: [],
          // pattern: all classes except for opacity variants like bg-red-100/20 as they produce 80k+ classes
          safelist: [{ pattern: /^[^\/]+$/, variants: [] }],
          corePlugins: {
            preflight: false,
          },
          theme: tailwindConfig.theme ?? {},
          plugins: [],
        }),
      ]).process(
        `
          @tailwind base;
          @tailwind components;
          @tailwind utilities;
          `,
      )

      const tailwindClasses = Object.fromEntries(
        postcssResult.root.nodes
          .filter((node) => {
            const singleClassSelectorRegex = /^\.\S+$/
            return node.type === 'rule' && node.selector.match(singleClassSelectorRegex)
          })
          .map((rule) => {
            rule = rule as Rule
            return [
              rule.selector.replace('.', ''),
              {
                css: rule.toString(),
                nodes: rule.nodes
                  .filter((node): node is Declaration => {
                    return node.type === 'decl'
                  })
                  .map((decl) => {
                    return { prop: decl.prop, value: decl.value }
                  }),
              },
            ]
          }),
      )
      tailwindClassesRef.current = tailwindClasses
      await indexDb.set('tailwindConfigHashCached', tailwindConfigHash)
      await indexDb.set('tailwindClassesCache', tailwindClasses)
    })()
  }, [])

  return {
    tailwindClasses: tailwindClassesRef.current,
  }
}
