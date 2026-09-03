import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  build: {
    emptyOutDir: true,
    outDir: 'out/renderer',
    sourcemap: true,
    target: 'es2022'
  }
});
