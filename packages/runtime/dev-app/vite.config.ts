import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const libConfig = require('../vite.config')

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: libConfig.default.resolve,
  build: {
    target: ['es2020'],
  },
  define: {
    'process.env': {},
  },
})
