import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@opencode-ai/sdk/v2': path.resolve(__dirname, '../node_modules/@opencode-ai/sdk/dist/v2/client.js'),
      '@opencode-ai/sdk': path.resolve(__dirname, '../node_modules/@opencode-ai/sdk/dist/client.js'),
    },
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@opencode-ai/sdk/v2'],
  },
  build: {
    outDir: '../dist/public',
    emptyOutDir: true,
    rollupOptions: {
      external: ['node:child_process', 'node:fs', 'node:path', 'node:url', 'child_process', 'fs', 'path', 'url'],
    },
  },
});
