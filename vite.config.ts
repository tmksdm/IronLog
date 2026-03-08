import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/IronLog/',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'wasm-mime-type',
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          if (_req.url?.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
          }
          next();
        });
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: ['jeep-sqlite', '@capacitor-community/sqlite'],
  },
});
