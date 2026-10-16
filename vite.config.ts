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

// Generate a versioned app shell. Updates activate automatically so even a
// client with a broken UI can recover without pressing an in-app button.
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
      const source = `const CACHE_PREFIX = ${JSON.stringify(cachePrefix)};
const CACHE_NAME = ${JSON.stringify(`${cachePrefix}${version}`)};
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

  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request)));
});
`;
      writeFileSync(resolve(outDir, 'sw.js'), source);
      console.log(`Service worker generated: ${version}`);
    },
  };
}

// ==========================================
// Test build (mode: testdeploy)
//
// The test build must not be able to reach the production Supabase project:
//  - cloud modules are replaced by stubs at resolve time;
//  - the build fails if any production credential reaches the artifact;
//  - the shell carries a CSP that restricts network access to its own origin;
//  - the installed PWA identifies itself as "IronLog Test".
// ==========================================

/** Production modules replaced by stubs in the test build. */
const TEST_BUILD_MODULE_STUBS: ReadonlyArray<readonly [string, string]> = [
  ['src/lib/supabase.ts', 'src/lib/supabase.disabled.ts'],
  ['src/lib/sync.ts', 'src/lib/sync.disabled.ts'],
  [
    'src/components/settings/SyncDiagnostics.tsx',
    'src/components/settings/SyncDiagnostics.disabled.tsx',
  ],
];

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

/**
 * Reads the production credentials from the source module, so the artifact
 * check can never drift from the real values. Throws when the values cannot be
 * extracted: a silently empty check would be worse than a failed build.
 */
function readCloudSecrets(): string[] {
  const source = readFileSync(resolve(__dirname, 'src/lib/supabase.ts'), 'utf-8');
  const url = source.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0];
  const key = source.match(/eyJ[A-Za-z0-9_-]{20,}/)?.[0];
  const projectRef = url?.replace('https://', '').split('.')[0];
  const secrets = [url, projectRef, key?.slice(0, 40)].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
  if (secrets.length < 3) {
    throw new Error(
      'Не удалось извлечь URL, project ref и ключ Supabase из src/lib/supabase.ts — ' +
        'проверка артефакта тестовой сборки не может быть выполнена'
    );
  }
  return secrets;
}

/** Replaces cloud modules with stubs; active only in the test build. */
function cloudIsolationPlugin(enabled: boolean) {
  return {
    name: 'ironlog-cloud-isolation',
    enforce: 'pre' as const,
    apply: 'build' as const,
    async resolveId(source: string, importer: string | undefined, resolveOptions: object) {
      if (!enabled) return null;
      const resolved = await this.resolve(source, importer, {
        ...resolveOptions,
        skipSelf: true,
      });
      if (!resolved) return null;
      const id = resolved.id.replaceAll('\\', '/');
      for (const [original, stub] of TEST_BUILD_MODULE_STUBS) {
        if (id.endsWith(`/${original}`)) {
          return resolve(__dirname, stub);
        }
      }
      return null;
    },
  };
}

/** Test identity, CSP and the fail-closed artifact check. */
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

      const secrets = readCloudSecrets();
      const leaked: string[] = [];
      for (const file of listBuildFiles(outDir)) {
        const content = readFileSync(resolve(outDir, file));
        for (const secret of secrets) {
          if (content.includes(Buffer.from(secret))) {
            leaked.push(`${file} → ${secret.slice(0, 24)}…`);
          }
        }
      }
      if (leaked.length > 0) {
        throw new Error(
          'Тестовая сборка содержит данные production Supabase, публикация запрещена:\n' +
            leaked.join('\n')
        );
      }
      console.log('✅ test build: production Supabase не найден в артефакте');
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
    plugins: [
      cloudIsolationPlugin(isTestBuild),
      react(),
      tailwindcss(),
      versionJsonPlugin(),
      controlledUpdateServiceWorkerPlugin(base, isTestBuild ? 'ironlog-test-' : 'ironlog-'),
      // Keep last: the artifact check must run after every file has been written.
      testBuildPlugin(isTestBuild),
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
            ...(isTestBuild ? {} : { 'supabase-vendor': ['@supabase/supabase-js'] }),
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
