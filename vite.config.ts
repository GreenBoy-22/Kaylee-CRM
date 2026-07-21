import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sit: resolve(__dirname, 'sit.html'),
        rate: resolve(__dirname, 'rate.html'),
        watch: resolve(__dirname, 'watch.html'),
      },
    },
  },
});
