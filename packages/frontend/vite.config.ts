import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'shared': resolve(__dirname, '../shared/src')
    }
  },
  server: {
    port: 5555,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
});
