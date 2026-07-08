import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    proxy: {
      '/user': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        secure: false,
      },
      // 🎯 ADD THIS: Special secure proxy highway directly to Python
      '/ai': {
        target: 'http://localhost:8501', 
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ai/, '') // Strips '/ai' before hitting Python
      }
    }
  }
})
