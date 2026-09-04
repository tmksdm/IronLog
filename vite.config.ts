import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ReleaseMetadata {
  version: string;
  changes: string[];
}

// Read current release metadata from src/version.ts at build time
function getReleaseMetadata(): ReleaseMetadata {
  try {
    const content = readFileSync(resolve(__dirname, 'src/version.ts'), 'utf-8');
    const match = content.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    const version = match?.[1] ?? '0.0.0';
    const entryStart = content.indexOf(`version: '${version}'`);
    const changesStart = content.indexOf('changes: [', entryStart);
    const changesEnd = content.indexOf(']', changesStart);
    const changesBlock = content.slice(changesStart, changesEnd);
    const changes = [...changesBlock.matchAll(/'([^']+)'/g)].map((item) => item[1]);
    return { version, changes };
  } catch {
    return { version: '0.0.0', changes: [] };
  }
}

// Vite plugin: generate version.json in the output directory after build
function versionJsonPlugin() {
  return {
    name: 'generate-version-json',
    closeBundle() {
      const { version, changes } = getReleaseMetadata();
      const outDir = resolve(__dirname, 'dist');
      mkdirSync(outDir, { recursive: true });
      writeFileSync(
        resolve(outDir, 'version.json'),
        JSON.stringify({ version, changes, timestamp: Date.now() })
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
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'supabase-vendor': ['@supabase/supabase-js'],
            'sqlite-vendor': [
              '@capacitor-community/sqlite',
              'jeep-sqlite',
              'sql.js',
            ],
          },
        },
      },
    },
    optimizeDeps: {
      exclude: ['jeep-sqlite', '@capacitor-community/sqlite'],
    },
  };
});
