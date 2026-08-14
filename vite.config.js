import { defineConfig } from 'vite';

export default defineConfig({
  base: '/vocab-enhancer/',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
