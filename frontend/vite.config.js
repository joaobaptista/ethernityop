import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
  test: {
    globals: true,
  },
})
