import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['../../../.prettierrc.js'],
  },
  define: {
    'process.env': {},
  },
})
