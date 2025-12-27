import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3002', // UPDATED: Match ecosystem.config.js PORT
        changeOrigin: true,
      }
    }
  },
  preview: { // Preview mode also needs this if running vite preview
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      }
    },
    allowedHosts: [
      'dashboard.dev.swarmstack.net',
      'dashboard.swarmstack.net'
    ]
  }
})
