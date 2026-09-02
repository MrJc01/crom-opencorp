import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  plugins: [
    tailwindcss(),
    solidPlugin(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/web'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'web-dist'),
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/chunk-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/workspaces': 'http://127.0.0.1:4100',
      '/agents': 'http://127.0.0.1:4100',
      '/tasks': 'http://127.0.0.1:4100',
      '/schedules': 'http://127.0.0.1:4100',
      '/flows': 'http://127.0.0.1:4100',
      '/hooks': 'http://127.0.0.1:4100',
      '/apps': 'http://127.0.0.1:4100',
      '/secrets': 'http://127.0.0.1:4100',
      '/notifications': 'http://127.0.0.1:4100',
      '/settings': 'http://127.0.0.1:4100',
      '/files': 'http://127.0.0.1:4100',
      '/terminal': 'http://127.0.0.1:4100',
      '/secretario': 'http://127.0.0.1:4100',
      '/meetings': 'http://127.0.0.1:4100',
      '/ledger': 'http://127.0.0.1:4100',
      '/health': 'http://127.0.0.1:4100',
      '/events': 'http://127.0.0.1:4100',
    },
  },
});
