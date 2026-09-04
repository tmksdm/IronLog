import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
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
    apply: 'build' as const,
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

function listBuildFiles(directory: string, root = directory): string[] {
  return readdirSync(directory).flatMap((name) => {
    const absolutePath = resolve(directory, name);
    if (statSync(absolutePath).isDirectory()) {
      return listBuildFiles(absolutePath, root);
    }
    return [absolutePath.slice(root.length + 1).replaceAll('\\', '/')];
  });
}

// Generate a versioned app shell. A new worker waits until the user accepts it.
function controlledUpdateServiceWorkerPlugin(base: string) {
  return {
    name: 'controlled-update-service-worker',
    apply: 'build' as const,
    closeBundle() {
      const outDir = resolve(__dirname, 'dist');
      const { version } = getReleaseMetadata();
      const files = listBuildFiles(outDir)
        .filter((file) => file !== 'sw.js' && file !== 'version.json')
        .map((file) => `${base}${file}`);
      const source = `const CACHE_NAME = ${JSON.stringify(`ironlog-${version}`)};
const PRECACHE_URLS = ${JSON.stringify(files)};
const APP_SHELL = ${JSON.stringify(`${base}index.html`)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('ironlog-') && name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.endsWith('/version.json')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match(APP_SHELL).then((cached) => cached || fetch(event.request)));
    return;
  }

  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request)));
});
`;
      writeFileSync(resolve(outDir, 'sw.js'), source);
      console.log(`Service worker generated: ${version}`);
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
      controlledUpdateServiceWorkerPlugin(base),
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
