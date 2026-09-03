import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: 'src/preload/preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.js'
    },
    outDir: 'out/preload',
    rollupOptions: {
      external: [/^node:/, 'electron']
    },
    sourcemap: true,
    target: 'es2022'
  }
});
