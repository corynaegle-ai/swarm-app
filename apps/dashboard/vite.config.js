import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    allowedHosts: [
      'dashboard.dev.swarmstack.net',
      'dashboard.swarmstack.net',
      'localhost'
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      }
    }
  },
  preview: {
    port: 3000,
    allowedHosts: [
      'dashboard.dev.swarmstack.net',
      'dashboard.swarmstack.net'
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      }
    }
  }
})
