const esbuild = require('esbuild')
const aliasPlugin = require('esbuild-plugin-alias')
const { dtsPlugin } = require('esbuild-plugin-d.ts')
const path = require('path')
const postcss = require('postcss')
const postcssConfig = require('./postcss.config.js')

async function main() {
  return Promise.all([
    build({
      format: 'esm',
      outfile: 'dist/impulse.es.mjs',
      plugins: [inlineCssPlugin, dtsPlugin({ outDir: 'dist' }), aliasPlugin(aliases)],
    }),

    build({
      format: 'iife',
      outfile: 'dist/impulse.iife.js',
      plugins: [
        inlineCssPlugin,
        // no dtsPlugin() to avoid doing it twice
        aliasPlugin(aliases),
      ],
    }),
  ])
}

function build(buildParams = {}) {
  return esbuild.build({
    entryPoints: ['src/index.tsx'],
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    treeShaking: true,
    jsx: 'automatic',
    inject: [
      path.resolve(__dirname, './src/fake-modules/process.js'),
      path.resolve(__dirname, './src/fake-modules/buffer.js'),
    ],
    sourcemap: true,
    logLevel: 'info',
    ...buildParams,
  })
}

const inlineCssPlugin = {
  name: 'inline-css',
  setup({ onLoad }) {
    const fs = require('fs/promises')
    onLoad({ filter: /\.css$/ }, async ({ path }) => {
      const processor = postcss(postcssConfig.plugins)
      const content = await fs.readFile(path)
      const result = await processor.process(content, { from: path })

      // we make it json so that `import style from 'xyz.css'` does import the source CSS as `style`
      const jsonContent = JSON.stringify(result.css)

      return {
        contents: jsonContent,
        loader: 'json',
      }
    })
  },
}

const aliases = {
  // make sure the version of react is the same across all files
  react: require.resolve('react'),
  path: require.resolve('path-browserify'),
  os: require.resolve('os-browserify'),
  // can't use just resolve('assert') because it resolves to built-in node module
  assert: require.resolve('../../node_modules/assert'),
  colorette: path.resolve(__dirname, 'src/fake-modules/colorette.js'),
  crypto: path.resolve(__dirname, 'src/fake-modules/crypto.js'),
  fs: path.resolve(__dirname, 'src/fake-modules/fs.js'),
  url: path.resolve(__dirname, 'src/fake-modules/url.js'),
  'is-glob': path.resolve(__dirname, 'src/fake-modules/is-glob.js'),
  'glob-parent': path.resolve(__dirname, 'src/fake-modules/glob-parent.js'),
  'fast-glob': path.resolve(__dirname, 'src/fake-modules/fast-glob.js'),
}

main().catch(() => process.exit(1))
