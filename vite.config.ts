import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read APP_VERSION from src/version.ts at build time
function getAppVersion(): string {
  try {
    const content = readFileSync(resolve(__dirname, 'src/version.ts'), 'utf-8');
    const match = content.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    return match?.[1] ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// Vite plugin: generate version.json in the output directory after build
function versionJsonPlugin() {
  return {
    name: 'generate-version-json',
    closeBundle() {
      const version = getAppVersion();
      const outDir = resolve(__dirname, 'dist');
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
