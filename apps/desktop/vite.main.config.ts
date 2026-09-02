import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: 'src/main/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js'
    },
    outDir: 'out/main',
    rollupOptions: {
      external: [/^node:/, 'electron', 'electron-squirrel-startup', 'electron-updater']
    },
    sourcemap: true,
    target: 'es2022'
  }
});
