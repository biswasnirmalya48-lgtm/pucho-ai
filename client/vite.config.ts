import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = path.dirname(fileURLToPath(import.meta.url))
const apiTarget = process.env.PUCHO_API_URL || 'http://127.0.0.1:8787'

export default defineConfig({
  root: here,
  plugins: [react()],
  server: {
    port: Number(process.env.PUCHO_CLIENT_PORT || 5173),
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false, ws: false },
    },
  },
  build: {
    outDir: path.resolve(here, '../dist'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          markdown: ['react-markdown', 'remark-gfm', 'remark-math', 'rehype-katex', 'highlight.js'],
        },
      },
    },
  },
})