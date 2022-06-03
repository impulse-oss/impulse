import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-prod',
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'src/index.tsx'),
      name: 'Impulse',
      fileName: (format) => `impulse.${format}.js`
    },
    rollupOptions: {
    }
  }
})
