import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@docs': path.resolve(__dirname, '../docs')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    watch: {
      usePolling: true, // Docker上でのホットリロード対応
    },
    fs: {
      allow: ['..', '/docs']
    }
  },
})
