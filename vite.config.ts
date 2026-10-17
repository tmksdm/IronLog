import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  existsSync,
} from 'fs';
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

/**
 * Identifies this particular build, not just the release it belongs to.
 *
 * A browser installs a new service worker only when `sw.js` itself changed, so a
 * republished build of the same version — which is the normal case for the test
 * stand — would otherwise never reach an installed PWA. The id is therefore
 * embedded in `sw.js`, published in `version.json` and baked into the bundle, so
 * the running app can also tell whether the deployed build is the one it is.
 *
 * Computed once per build: the worker, `version.json` and the bundle must agree.
 */
let buildId: string | null = null;
function getBuildId(): string {
  if (buildId) return buildId;
  const source = process.env.IRONLOG_BUILD_ID
    || process.env.GITHUB_SHA?.slice(0, 7)
    || 'local';
  buildId = `${source}-${Date.now().toString(36)}`;
  return buildId;
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
        JSON.stringify({ version, changes, buildId: getBuildId(), timestamp: Date.now() })
      );
      console.log(`✅ version.json generated: ${version} (${getBuildId()})`);
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

// Generate a versioned app shell. Updates activate automatically so even a
// client with a broken UI can recover without pressing an in-app button.
//
// Cached assets are matched with `ignoreVary` on purpose. A host that adds a
// `Vary` header (GitHub Pages sends `Vary: Accept-Encoding`, a CORS-enabled
// server sends `Vary: Origin`) otherwise makes `cache.match` miss for the very
// resources that were precached, and the shell falls back to the network —
// which offline means a blank page. The precache is our own immutable build
// output, so the vary check has no value here.
function controlledUpdateServiceWorkerPlugin(base: string, cachePrefix = 'ironlog-') {
  return {
    name: 'controlled-update-service-worker',
    apply: 'build' as const,
    closeBundle() {
      const outDir = resolve(__dirname, 'dist');
      const { version } = getReleaseMetadata();
      const files = listBuildFiles(outDir)
        .filter((file) => file !== 'sw.js' && file !== 'version.json')
        .map((file) => `${base}${file}`);
      // BUILD_ID is what makes two builds of the same version different files.
      const source = `const CACHE_PREFIX = ${JSON.stringify(cachePrefix)};
const BUILD_ID = ${JSON.stringify(getBuildId())};
const CACHE_NAME = CACHE_PREFIX + ${JSON.stringify(version)} + '-' + BUILD_ID;
const PRECACHE_URLS = ${JSON.stringify(files)};
const APP_SHELL = ${JSON.stringify(`${base}index.html`)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function deleteOldCaches() {
  return caches.keys()
    .then((names) => {
      const previousCaches = names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .slice(-1);
      const keep = new Set([CACHE_NAME, ...previousCaches]);
      return Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && !keep.has(name))
          .map((name) => caches.delete(name))
      );
    });
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    const isUpdate = cacheNames.some(
      (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME
    );

    await self.clients.claim();

    // A broken page cannot listen for controllerchange. Reload it from the
    // worker itself so an update can recover a blank screen without clearing data.
    if (isUpdate) {
      const windowClients = await self.clients.matchAll({ type: 'window' });
      await Promise.all(
        windowClients.map((client) => typeof client.navigate === 'function'
          ? client.navigate(client.url).catch(() => undefined)
          : Promise.resolve())
      );
    }

    await deleteOldCaches();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.endsWith('/version.json')) return;

  if (event.request.mode === 'navigate') {
    const response = caches.open(CACHE_NAME).then((cache) => cache.match(APP_SHELL)).then((cached) => cached || fetch(event.request));
    event.respondWith(response);
    return;
  }

  event.respondWith(caches.match(event.request, { ignoreSearch: true, ignoreVary: true }).then((cached) => cached || fetch(event.request)));
});
`;
      writeFileSync(resolve(outDir, 'sw.js'), source);
      console.log(`Service worker generated: ${version} (${getBuildId()})`);
    },
  };
}

// ==========================================
// Test build (mode: testdeploy)
//
// The test build exists for the separate test origin, not for the cloud (the
// app has no cloud any more):
//  - the shell carries a CSP that restricts network access to its own origin;
//  - the installed PWA identifies itself as "IronLog Test" and uses its own
//    service-worker cache prefix, so it can never take over the production one.
// ==========================================

/**
 * `connect-src 'self'` is the point of this policy: no egress to any other
 * origin. `'wasm-unsafe-eval'` is required because the local database runs on
 * WebAssembly (sql.js). Styles stay permissive on purpose — the goal here is
 * the network barrier, not style hardening.
 */
const TEST_BUILD_CSP = [
  "default-src 'self'",
  "connect-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** Test identity and CSP. */
function testBuildPlugin(enabled: boolean) {
  return {
    name: 'ironlog-test-build',
    apply: 'build' as const,
    transformIndexHtml: {
      order: 'pre' as const,
      handler(html: string) {
        if (!enabled) return html;
        return html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${TEST_BUILD_CSP}" />`
        );
      },
    },
    closeBundle() {
      if (!enabled) return;

      const outDir = resolve(__dirname, 'dist');

      const manifestPath = resolve(outDir, 'manifest.json');
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        manifest.name = 'IronLog Test';
        manifest.short_name = 'IronLog Test';
        manifest.start_url = './';
        manifest.scope = './';
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      }

      // Harmless with the "GitHub Actions" Pages source, required if it is ever
      // switched to a branch.
      writeFileSync(resolve(outDir, '.nojekyll'), '');

      console.log('✅ test build: identity, CSP and cache prefix applied');
    },
  };
}

/**
 * Writes a `sourceModule → chunk` map. Enabled only through the
 * IRONLOG_MODULE_GRAPH environment variable and used by CI to prove the
 * static entry closure of the emitted bundle. It never changes the bundle.
 */
function moduleGraphReporterPlugin(outputPath: string) {
  return {
    name: 'ironlog-module-graph',
    apply: 'build' as const,
    generateBundle(_options: unknown, bundle: Record<string, any>) {
      const rows: string[] = [];
      for (const [file, item] of Object.entries(bundle)) {
        if (item.type !== 'chunk') continue;
        for (const id of Object.keys(item.modules)) {
          const normalized = String(id).replaceAll('\\', '/');
          const at = normalized.lastIndexOf('/src/');
          if (at === -1) continue;
          rows.push(`${normalized.slice(at + '/src/'.length)}\t${file}`);
        }
      }
      rows.sort();
      writeFileSync(resolve(__dirname, outputPath), `${rows.join('\n')}\n`);
      console.log(`Module graph written: ${outputPath} (${rows.length} entries)`);
    },
  };
}

export default defineConfig(({ mode }) => {
  // GitHub Pages needs '/IronLog/', everything else uses relative paths
  const isGitHubPages = mode === 'ghpages';
  const base = isGitHubPages ? '/IronLog/' : './';
  const isTestBuild = mode === 'testdeploy';

  if (isTestBuild) {
    const env = loadEnv(mode, __dirname, '');
    if (env.VITE_BUILD_KIND !== 'test') {
      throw new Error('Режим testdeploy требует VITE_BUILD_KIND=test (см. .env.testdeploy)');
    }
  }

  return {
    base,
    define: {
      // Lets the running app compare itself with the deployed build.
      'import.meta.env.VITE_BUILD_ID': JSON.stringify(getBuildId()),
    },
    plugins: [
      react(),
      tailwindcss(),
      versionJsonPlugin(),
      controlledUpdateServiceWorkerPlugin(base, isTestBuild ? 'ironlog-test-' : 'ironlog-'),
      // Keep last: the artifact check must run after every file has been written.
      testBuildPlugin(isTestBuild),
      ...(process.env.IRONLOG_MODULE_GRAPH
        ? [moduleGraphReporterPlugin(process.env.IRONLOG_MODULE_GRAPH)]
        : []),
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
          /**
           * Vendors are grouped by package. Vite's dynamic-import helper is kept
           * apart on purpose: it is shared by the entry and by the application
           * chunk, and if Rollup folds it into a vendor chunk, the entry ends up
           * statically importing that whole vendor — which would pull the SQLite
           * stack into the static closure of the entry, before the host name is
           * even checked (see scripts/ci/check-artifacts.mjs).
           */
          manualChunks(id) {
            const normalized = String(id).replaceAll('\\', '/');
            if (normalized.includes('vite/preload-helper')) return 'vite-helper';

            const groups: Record<string, string[]> = {
              'react-vendor': ['react', 'react-dom', 'react-router-dom'],
              'sqlite-vendor': ['@capacitor-community/sqlite', 'jeep-sqlite', 'sql.js'],
            };
            for (const [chunk, packages] of Object.entries(groups)) {
              if (packages.some((name) => normalized.includes(`/node_modules/${name}/`))) {
                return chunk;
              }
            }
            return undefined;
          },
        },
      },
    },
    optimizeDeps: {
      exclude: ['jeep-sqlite', '@capacitor-community/sqlite'],
    },
  };
});
