import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), dts()],
  // Mock out some dependencies to run Tailwind in the browser
  resolve: {
    alias: {
      colorette: path.resolve(__dirname, 'src/fake-modules/colorette.js'),
      fs: path.resolve(__dirname, 'src/fake-modules/fs.js'),
      url: path.resolve(__dirname, 'src/fake-modules/url.js'),
      path: 'path-browserify',
      'is-glob': path.resolve(__dirname, 'src/fake-modules/is-glob.js'),
      'glob-parent': path.resolve(__dirname, 'src/fake-modules/glob-parent.js'),
      'fast-glob': path.resolve(__dirname, 'src/fake-modules/fast-glob.js'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    target: ['es2020'],
    lib: {
      entry: path.resolve(__dirname, 'src/index.tsx'),
      name: 'Impulse',
      fileName: (format) => `impulse.${format}.js`,
    },
  },
})
