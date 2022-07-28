import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import pathBrowserify from 'path-browserify'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), dts()],
  // Mock out some dependencies to run Tailwind in the browser
  resolve: {
    alias: {
      colorette: pathBrowserify.resolve(
        __dirname,
        'src/fake-modules/colorette.js',
      ),
      fs: pathBrowserify.resolve(__dirname, 'src/fake-modules/fs.js'),
      url: pathBrowserify.resolve(__dirname, 'src/fake-modules/url.js'),
      path: 'path-browserify',
      os: 'os-browserify',
      assert: 'assert',
      'is-glob': pathBrowserify.resolve(
        __dirname,
        'src/fake-modules/is-glob.js',
      ),
      'glob-parent': pathBrowserify.resolve(
        __dirname,
        'src/fake-modules/glob-parent.js',
      ),
      'fast-glob': pathBrowserify.resolve(
        __dirname,
        'src/fake-modules/fast-glob.js',
      ),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2020',
    lib: {
      entry: path.resolve(__dirname, 'src/index.tsx'),
      name: 'Impulse',
      fileName: (format) => `impulse.${format}.js`,
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      inject: [
        path.resolve(__dirname, 'src/fake-modules/process.js'),
        path.resolve(__dirname, 'src/fake-modules/buffer.js'),
      ],
      target: 'es2020',
    },
  },
  define: {
    // 'process.env': {},
  },
})
