import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  publicDir: false,
  build: {
    outDir: 'web-dist',
    emptyOutDir: false,
    rollupOptions: {
      input: 'src/web/svelte-main.ts',
      output: {
        entryFileNames: 'assets/svelte-app.js',
        chunkFileNames: 'assets/svelte-[hash].js',
        assetFileNames: 'assets/svelte-[hash][extname]',
      },
    },
    commonjsOptions: { include: [/svelte/] },
  },
  optimizeDeps: { include: ['svelte/store', 'svelte'] },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4100',
      '/events': 'http://127.0.0.1:4100',
      '/secretario': 'http://127.0.0.1:4100',
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom',
  },
});
