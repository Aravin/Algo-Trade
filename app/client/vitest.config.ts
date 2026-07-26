import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    isolate: false,
    fileParallelism: false,
    environment: 'jsdom',
    setupFiles: [],
    css: false,
  },
})
