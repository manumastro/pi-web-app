import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  base: '/',
  worker: {
    format: 'es',
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
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          const match = id.split('node_modules/')[1];
          if (!match) {
            return undefined;
          }

          const segments = match.split('/');
          const packageName = match.startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];

          if (packageName === 'react' || packageName === 'react-dom') {
            return 'vendor-react';
          }

          if (packageName === '@opencode-ai/sdk') {
            return 'vendor-opencode-sdk';
          }

          if (packageName.includes('remark') || packageName.includes('rehype') || packageName === 'react-markdown' || packageName === 'marked') {
            return 'vendor-markdown';
          }

          if (packageName === '@base-ui/react' || packageName.startsWith('@base-ui') || packageName.startsWith('@radix-ui') || packageName === 'sonner' || packageName === 'cmdk') {
            return 'vendor-ui';
          }

          if (packageName === 'lucide-react' || packageName === '@remixicon/react') {
            return 'vendor-icons';
          }

          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@opencode-ai/sdk/v2': path.resolve(__dirname, '../node_modules/@opencode-ai/sdk/dist/v2/client.js'),
    },
  },
  server: {
    port: 3211,
    proxy: {
      '/api': {
        target: 'http://localhost:3210',
        changeOrigin: true,
      },
      '/events': {
        target: 'http://localhost:3210',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
