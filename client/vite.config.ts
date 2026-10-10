import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// During development the client calls `/api/...` and Vite proxies those
// requests to the Express server, avoiding CORS issues.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
