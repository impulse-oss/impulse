import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import * as path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 3005,
  },
  plugins: [react()],
  resolve: {
    alias: {
      colorette: path.resolve(__dirname, '../src/fake-modules/colorette.js'),
      fs: path.resolve(__dirname, '../src/fake-modules/fs.js'),
      url: path.resolve(__dirname, '../src/fake-modules/url.js'),
      path: 'path-browserify',
      os: 'os-browserify',
      assert: 'assert',
      'is-glob': path.resolve(__dirname, '../src/fake-modules/is-glob.js'),
      'glob-parent': path.resolve(__dirname, '../src/fake-modules/glob-parent.js'),
      'fast-glob': path.resolve(__dirname, '../src/fake-modules/fast-glob.js'),
      'tailwind.config.js': path.resolve(__dirname, '../tailwind.config.js'),
    },
  },
  build: {
    target: 'es2020',
  },
  optimizeDeps: {
    include: ['tailwind.config.js'],
    esbuildOptions: {
      inject: [
        path.resolve(__dirname, '../src/fake-modules/process.js'),
        path.resolve(__dirname, '../src/fake-modules/buffer.js'),
      ],
      target: 'es2020',
    },
  },
})
