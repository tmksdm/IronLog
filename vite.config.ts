import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// Read version from version.ts at build time
function versionJsonPlugin() {
  return {
    name: 'generate-version-json',
    writeBundle(options: { dir?: string }) {
      const outDir = options.dir || 'dist';
      // Dynamic import won't work here, so we read the file directly
      const versionFile = resolve(__dirname, 'src/version.ts');
      const content = require('fs').readFileSync(versionFile, 'utf-8');
      const match = content.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
      const version = match ? match[1] : '0.0.0';

      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        resolve(outDir, 'version.json'),
        JSON.stringify({ version, timestamp: Date.now() })
      );
      console.log(`✅ version.json generated: ${version}`);
    },
  };
}

export default defineConfig(({ mode }) => {
  // GitHub Pages needs '/IronLog/', everything else uses relative paths
  const isGitHubPages = mode === 'ghpages';
  const base = isGitHubPages ? '/IronLog/' : './';

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      versionJsonPlugin(),
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
  };
});
