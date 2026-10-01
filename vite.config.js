import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: rootDir,
  resolve: {
    dedupe: ['firebase', '@firebase/app', '@firebase/auth', '@firebase/firestore', '@firebase/storage'],
  },
  optimizeDeps: {
    include: [
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/storage',
    ],
  },
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    open: '/customer/',
    fs: {
      strict: true,
      allow: [rootDir],
    },
    watch: {
      ignored: ['**/.Trash/**', '**/OneDrive-Personal/**'],
    },
  },
  build: {
    rollupOptions: {
      input: {
        customer: path.resolve(rootDir, 'customer/index.html'),
        admin: path.resolve(rootDir, 'admin/index.html'),
        driver: path.resolve(rootDir, 'driver/index.html'),
        legacy: path.resolve(rootDir, 'donghood-order.html'),
      },
    },
  },
});
