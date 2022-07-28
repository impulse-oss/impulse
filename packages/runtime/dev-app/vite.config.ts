import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const libConfig = require('../vite.config').default

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 3005,
  },
  plugins: [react()],
  resolve: libConfig.resolve,
  build: {
    target: libConfig.build.target,
  },
  optimizeDeps: libConfig.optimizeDeps,
  define: {
    // 'process.env': {},
  },
})
