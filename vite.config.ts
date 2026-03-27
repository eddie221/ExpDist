import { defineConfig } from 'vite';

export default defineConfig({
  base: '/ExpDist/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
