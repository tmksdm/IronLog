// scripts/ci/check-artifacts.test.mjs
//
// Tests for the artifact check. They use synthetic credentials, so they stay
// valid when the real key is rotated, and they include the negative cases: a
// deliberately damaged artifact must always be rejected.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ENTRY_CLOSURE_ALLOWLIST,
  ENTRY_DYNAMIC_IMPORTS,
  ENTRY_SOURCE_IMPORTS,
  checkArtifact,
  checkEntryClosure,
  readEntryImports,
  selfTest,
  selfTestEntryClosure,
} from './check-artifacts.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SECRETS = {
  url: 'https://testprojectref123.supabase.co',
  projectRef: 'testprojectref123',
  keyPrefix: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
};

const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'" />`;

const created = [];

afterEach(() => {
  while (created.length > 0) {
    rmSync(created.pop(), { recursive: true, force: true });
  }
});

function makeDir() {
  const dir = mkdtempSync(join(tmpdir(), 'ironlog-artifact-'));
  created.push(dir);
  return dir;
}

function write(dir, file, content) {
  const target = resolve(dir, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function writeGraph(lines) {
  const dir = makeDir();
  const path = resolve(dir, 'module-graph.txt');
  writeFileSync(path, `${lines.join('\n')}\n`);
  return path;
}

/** A worker shaped like the generated one: cache list, app shell and origin guard. */
function workerSource({ prefix, base, urls, version = '0.0.0' }) {
  return [
    `const CACHE_PREFIX = ${JSON.stringify(prefix)};`,
    `const CACHE_NAME = ${JSON.stringify(`${prefix}${version}`)};`,
    `const PRECACHE_URLS = ${JSON.stringify(urls.map((url) => `${base}${url}`))};`,
    `const APP_SHELL = ${JSON.stringify(`${base}index.html`)};`,
    "self.addEventListener('fetch', (event) => { const url = new URL(event.request.url); if (url.origin !== self.location.origin || url.pathname.endsWith('/version.json')) return; });",
  ].join('\n');
}

const TEST_WORKER_FILES = ['.nojekyll', 'assets/index-abc.js', 'index.html', 'manifest.json'];
const PRODUCTION_WORKER_FILES = [
  'assets/supabase-vendor-xyz.js',
  'index.html',
  'manifest.json',
];

function testArtifact(overrides = {}) {
  const dir = makeDir();
  write(dir, 'index.html', overrides.html ?? `<html><head>${CSP}</head><body></body></html>`);
  write(
    dir,
    'manifest.json',
    overrides.manifest ??
      JSON.stringify({
        name: 'IronLog Test',
        short_name: 'IronLog Test',
        start_url: './',
        scope: './',
      })
  );
  write(
    dir,
    'sw.js',
    overrides.sw ??
      workerSource({ prefix: 'ironlog-test-', base: './', urls: TEST_WORKER_FILES })
  );
  if (overrides.nojekyll !== false) write(dir, '.nojekyll', '');
  write(dir, 'assets/index-abc.js', overrides.bundle ?? "const marker = 'ironlog-cloud-stub';");
  return dir;
}

function productionArtifact(overrides = {}) {
  const dir = makeDir();
  write(dir, 'index.html', overrides.html ?? '<html><head></head><body></body></html>');
  write(
    dir,
    'manifest.json',
    overrides.manifest ?? JSON.stringify({ name: 'IronLog', start_url: '/IronLog/' })
  );
  write(
    dir,
    'sw.js',
    overrides.sw ??
      workerSource({ prefix: 'ironlog-', base: '/IronLog/', urls: PRODUCTION_WORKER_FILES })
  );
  write(
    dir,
    'assets/supabase-vendor-xyz.js',
    overrides.bundle ?? `const url='${SECRETS.url}'; class GoTrueClient {}`
  );
  return dir;
}

const check = (mode, dir, moduleGraph = '') =>
  checkArtifact({ mode, dir, moduleGraph, secrets: SECRETS });

describe('test artifact', () => {
  it('accepts a correct artifact', () => {
    const result = check('test', testArtifact());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects a leaked production URL', () => {
    const dir = testArtifact({ bundle: `const marker='ironlog-cloud-stub';\nconst u='${SECRETS.url}';` });
    const result = check('test', dir);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('credentials production Supabase');
  });

  it('rejects a leaked project ref', () => {
    const result = check('test', testArtifact({ bundle: `x='${SECRETS.projectRef}';` }));
    expect(result.ok).toBe(false);
  });

  it('rejects a leaked key', () => {
    const result = check('test', testArtifact({ bundle: `x='${SECRETS.keyPrefix}'+'.rest';` }));
    expect(result.ok).toBe(false);
  });

  it('rejects a bundled Supabase SDK', () => {
    const result = check(
      'test',
      testArtifact({ bundle: "const marker='ironlog-cloud-stub'; class GoTrueClient {}" })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('SDK');
  });

  it('rejects a supabase-vendor chunk', () => {
    const dir = testArtifact();
    write(dir, 'assets/supabase-vendor-abc.js', 'export {};');
    expect(check('test', dir).ok).toBe(false);
  });

  it('rejects a missing CSP or a CSP without connect-src self', () => {
    expect(check('test', testArtifact({ html: '<html><head></head></html>' })).ok).toBe(false);
    expect(
      check('test', testArtifact({ html: `<meta http-equiv="Content-Security-Policy" content="default-src 'self'" />` }))
        .ok
    ).toBe(false);
  });

  it('rejects a production manifest', () => {
    const result = check(
      'test',
      testArtifact({ manifest: JSON.stringify({ name: 'IronLog', start_url: '/IronLog/', scope: '/IronLog/' }) })
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a production cache prefix', () => {
    expect(
      check(
        'test',
        testArtifact({ sw: workerSource({ prefix: 'ironlog-', base: './', urls: TEST_WORKER_FILES }) })
      ).ok
    ).toBe(false);
  });

  it('rejects a missing .nojekyll', () => {
    expect(check('test', testArtifact({ nojekyll: false })).ok).toBe(false);
  });

  it('rejects an artifact without the stub marker', () => {
    const result = check('test', testArtifact({ bundle: 'const nothing = 1;' }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('маркер');
  });

  it('requires the stubs in the module graph and rejects the real modules', () => {
    const good = writeGraph([
      'lib/supabase.disabled.ts\tassets/index-abc.js',
      'lib/sync.disabled.ts\tassets/index-abc.js',
    ]);
    expect(check('test', testArtifact(), good).ok).toBe(true);

    const real = writeGraph(['lib/supabase.ts\tassets/index-abc.js']);
    const result = check('test', testArtifact(), real);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('заглушки');
  });

  it('rejects a missing directory', () => {
    expect(check('test', resolve(tmpdir(), 'ironlog-does-not-exist-42')).ok).toBe(false);
  });
});

describe('production artifact', () => {
  it('accepts a correct artifact', () => {
    const result = check('production', productionArtifact());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects a production artifact without credentials or SDK', () => {
    expect(check('production', productionArtifact({ bundle: 'const x = 1;' })).ok).toBe(false);
  });

  it('rejects a test CSP in production', () => {
    expect(check('production', productionArtifact({ html: `<html><head>${CSP}</head></html>` })).ok).toBe(false);
  });

  it('rejects a test manifest, a test cache prefix, .nojekyll and stub markers', () => {
    expect(
      check('production', productionArtifact({ manifest: JSON.stringify({ name: 'IronLog Test', start_url: './' }) })).ok
    ).toBe(false);
    expect(
      check(
        'production',
        productionArtifact({
          sw: workerSource({
            prefix: 'ironlog-test-',
            base: '/IronLog/',
            urls: PRODUCTION_WORKER_FILES,
          }),
        })
      ).ok
    ).toBe(false);
    const withNojekyll = productionArtifact();
    write(withNojekyll, '.nojekyll', '');
    expect(check('production', withNojekyll).ok).toBe(false);
    expect(
      check('production', productionArtifact({ bundle: `const u='${SECRETS.url}'; const m='ironlog-cloud-stub';` })).ok
    ).toBe(false);
  });

  it('requires the real modules in the module graph and rejects stubs', () => {
    const good = writeGraph(['lib/supabase.ts\tassets/index-abc.js', 'lib/sync.ts\tassets/index-abc.js']);
    expect(check('production', productionArtifact(), good).ok).toBe(true);

    const stubbed = writeGraph(['lib/supabase.disabled.ts\tassets/index-abc.js']);
    expect(check('production', productionArtifact(), stubbed).ok).toBe(false);
  });
});

describe('service worker rules', () => {
  it('rejects a worker that could reach another origin', () => {
    const result = check(
      'test',
      testArtifact({
        sw: `${workerSource({ prefix: 'ironlog-test-', base: './', urls: TEST_WORKER_FILES })}\nfetch('https://example.com/ping');`,
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('внешний URL');
  });

  it('rejects a worker without the origin guard', () => {
    const result = check(
      'test',
      testArtifact({
        sw: workerSource({ prefix: 'ironlog-test-', base: './', urls: TEST_WORKER_FILES }).replace(
          /url\.origin !== self\.location\.origin \|\| /,
          ''
        ),
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('проверки origin');
  });

  it('rejects a cache entry outside the origin or missing from the artifact', () => {
    const outside = check(
      'test',
      testArtifact({
        sw: [
          'const CACHE_PREFIX = "ironlog-test-";',
          'const PRECACHE_URLS = ["https://cdn.example.com/x.js","./index.html"];',
          'const APP_SHELL = "./index.html";',
          "self.addEventListener('fetch', (event) => { if (url.origin !== self.location.origin) return; });",
        ].join('\n'),
      })
    );
    expect(outside.ok).toBe(false);
    expect(outside.errors.join(' ')).toContain('за пределами origin');

    const phantom = check(
      'test',
      testArtifact({
        sw: workerSource({
          prefix: 'ironlog-test-',
          base: './',
          urls: [...TEST_WORKER_FILES, 'assets/ghost.js'],
        }),
      })
    );
    expect(phantom.ok).toBe(false);
    expect(phantom.errors.join(' ')).toContain('которых нет в артефакте');
  });

  it('rejects version.json inside the offline shell cache', () => {
    const dir = testArtifact({
      sw: workerSource({
        prefix: 'ironlog-test-',
        base: './',
        urls: [...TEST_WORKER_FILES, 'version.json'],
      }),
    });
    write(dir, 'version.json', '{"version":"0.0.0"}');
    const result = check('test', dir);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('version.json попал в кэш');
  });

  it('rejects a build file that is not precached', () => {
    const result = check(
      'test',
      testArtifact({
        sw: workerSource({
          prefix: 'ironlog-test-',
          base: './',
          urls: TEST_WORKER_FILES.filter((file) => file !== 'assets/index-abc.js'),
        }),
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('не попали файлы сборки');
  });
});

// ------------------------------------------------------------ entry closure

const CLOSURE_ENTRY_MODULES = [
  'main.tsx',
  'lib/buildTarget.ts',
  'lib/entryGate.ts',
  'components/ui/HostGuard.tsx',
  'components/ui/AppErrorBoundary.tsx',
  'components/ui/EntryLoadErrorScreen.tsx',
  'index.css',
];

const ENTRY_IMPORTS = {
  staticImports: [...ENTRY_SOURCE_IMPORTS],
  dynamicImports: [...ENTRY_DYNAMIC_IMPORTS],
};

function closureArtifact(overrides = {}) {
  const dir = makeDir();
  write(
    dir,
    'index.html',
    overrides.html ??
      '<html><head><script type="module" src="./assets/index-entry.js"></script></head><body></body></html>'
  );
  write(
    dir,
    'assets/index-entry.js',
    overrides.entry ?? 'import "./vite-helper.js";\nimport "./react-vendor.js";\nvoid import("./App.js");\n'
  );
  write(dir, 'assets/vite-helper.js', 'export const helper = 1;\n');
  write(dir, 'assets/react-vendor.js', 'export const react = 1;\n');
  write(
    dir,
    'assets/App.js',
    overrides.app ?? 'import "./sqlite-vendor.js";\nexport default 1;\n'
  );
  write(
    dir,
    'assets/sqlite-vendor.js',
    overrides.vendor ?? 'class SQLiteConnection {}\nexport {};\n'
  );
  return dir;
}

function closureGraph(extraRows = []) {
  return writeGraph([
    ...CLOSURE_ENTRY_MODULES.map((module) => `${module}\tassets/index-entry.js`),
    'App.tsx\tassets/App.js',
    ...extraRows,
  ]);
}

const checkClosure = (dir, moduleGraph, entryImports = ENTRY_IMPORTS) =>
  checkEntryClosure({ dir, moduleGraph, entryImports, secrets: SECRETS });

describe('entry closure', () => {
  it('accepts an artifact whose entry reaches only the gate', () => {
    const result = checkClosure(closureArtifact(), closureGraph());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects a static import of the application chunk', () => {
    const dir = closureArtifact({
      entry: 'import "./App.js";\nvoid import("./vite-helper.js");\n',
    });
    const result = checkClosure(dir, closureGraph());
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('оказался модуль App.tsx');
  });

  it('rejects a vendor chunk by its content, not by its name', () => {
    const dir = closureArtifact({ entry: 'import "./sqlite-vendor.js";\n' });
    const result = checkClosure(dir, closureGraph());
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('SQLiteConnection');
  });

  it('rejects a credential inside the closure', () => {
    const dir = closureArtifact({
      entry: `import "./vite-helper.js";\nexport const leaked = '${SECRETS.url}';\n`,
    });
    const result = checkClosure(dir, closureGraph());
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('production credential');
  });

  it('rejects modulepreload of the application chunk', () => {
    const dir = closureArtifact({
      html: '<html><head><script type="module" src="./assets/index-entry.js"></script><link rel="modulepreload" href="./assets/App.js"></head></html>',
    });
    const result = checkClosure(dir, closureGraph());
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('modulepreload');
  });

  it('rejects an incomplete module graph', () => {
    const graph = writeGraph([
      ...CLOSURE_ENTRY_MODULES.filter((module) => module !== 'lib/entryGate.ts').map(
        (module) => `${module}\tassets/index-entry.js`
      ),
      'App.tsx\tassets/App.js',
    ]);
    const result = checkClosure(closureArtifact(), graph);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('нет модуля lib/entryGate.ts');
  });

  it('rejects an empty or missing module graph', () => {
    expect(checkClosure(closureArtifact(), writeGraph([])).errors.join(' ')).toContain('граф модулей пуст');
    expect(checkClosure(closureArtifact(), '').errors.join(' ')).toContain('граф модулей не передан');
  });

  it('requires exactly one module script', () => {
    const two = closureArtifact({
      html: '<html><head><script type="module" src="./assets/index-entry.js"></script><script type="module" src="./assets/App.js"></script></head></html>',
    });
    expect(checkClosure(two, closureGraph()).errors.join(' ')).toContain('2 module-скриптов');
    const none = closureArtifact({ html: '<html><head></head></html>' });
    expect(checkClosure(none, closureGraph()).errors.join(' ')).toContain('0 module-скриптов');
  });

  it('rejects entry imports that changed in the source', () => {
    const extra = {
      staticImports: [...ENTRY_SOURCE_IMPORTS, './lib/supabase'],
      dynamicImports: [...ENTRY_DYNAMIC_IMPORTS],
    };
    expect(checkClosure(closureArtifact(), closureGraph(), extra).errors.join(' ')).toContain(
      'не совпадают с разрешёнными'
    );

    const otherDynamic = {
      staticImports: [...ENTRY_SOURCE_IMPORTS],
      dynamicImports: ['../App'],
    };
    expect(checkClosure(closureArtifact(), closureGraph(), otherDynamic).errors.join(' ')).toContain(
      'динамические импорты'
    );
  });

  it('fails closed when the source import list is missing', () => {
    const result = checkClosure(closureArtifact(), closureGraph(), null);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('не передан');
  });
});

describe('entry closure self test', () => {
  it('rejects every prepared damage and accepts the untouched artifact', () => {
    const result = selfTestEntryClosure({
      dir: closureArtifact(),
      moduleGraph: closureGraph(),
      entryImports: ENTRY_IMPORTS,
      secrets: SECRETS,
    });
    expect(result.cases.map((item) => item.name)).toEqual([
      'неповреждённый артефакт',
      'статический импорт app-чанка в entry',
      'статический импорт вендорного чанка с запрещённым содержимым',
      'неполный граф модулей',
      'modulepreload для app-чанка',
      'нет module-скрипта в index.html',
    ]);
    expect(result.cases.filter((item) => !item.ok)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails closed when the artifact has no entry script', () => {
    const result = selfTestEntryClosure({
      dir: closureArtifact({ html: '<html><head></head></html>' }),
      moduleGraph: closureGraph(),
      entryImports: ENTRY_IMPORTS,
      secrets: SECRETS,
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('entry-чанк не найден');
  });

  it('does not modify the original artifact', () => {
    const dir = closureArtifact();
    const entry = readFileSync(resolve(dir, 'assets/index-entry.js'), 'utf-8');
    selfTestEntryClosure({
      dir,
      moduleGraph: closureGraph(),
      entryImports: ENTRY_IMPORTS,
      secrets: SECRETS,
    });
    expect(readFileSync(resolve(dir, 'assets/index-entry.js'), 'utf-8')).toBe(entry);
    expect(checkClosure(dir, closureGraph()).ok).toBe(true);
  });
});

describe('reading the entry source', () => {
  it('reads the real entry imports and matches the allowed list', () => {
    const result = readEntryImports(REPO_ROOT);
    expect([...new Set(result.staticImports)].sort()).toEqual([...ENTRY_SOURCE_IMPORTS].sort());
    expect(result.dynamicImports).toEqual([...ENTRY_DYNAMIC_IMPORTS]);
    expect(ENTRY_CLOSURE_ALLOWLIST).toContain('main.tsx');
  });

  it('ignores comments and reads dynamic calls separately', () => {
    const root = makeDir();
    write(
      root,
      'src/main.tsx',
      "// import './App' is deliberately dynamic\nimport { x } from './x';\nvoid import('./App');\n"
    );
    const result = readEntryImports(root);
    expect(result.staticImports).toEqual(['./x']);
    expect(result.dynamicImports).toEqual(['./App']);
  });

  it('fails closed when the entry module is missing', () => {
    expect(() => readEntryImports(makeDir())).toThrow(/нет src\/main\.tsx/);
  });
});

describe('mode self test', () => {
  it('proves the test-mode check rejects an injected credential', () => {
    const result = selfTest({ mode: 'test', dir: testArtifact(), secrets: SECRETS });
    expect(result.detail).toBeTruthy();
    expect(result.ok).toBe(true);
  });

  it('proves the production-mode check rejects a stripped artifact', () => {
    const result = selfTest({ mode: 'production', dir: productionArtifact(), secrets: SECRETS });
    expect(result.ok).toBe(true);
  });

  it('does not modify the original artifact', () => {
    const dir = testArtifact();
    const before = checkArtifact({ mode: 'test', dir, secrets: SECRETS });
    selfTest({ mode: 'test', dir, secrets: SECRETS });
    const after = checkArtifact({ mode: 'test', dir, secrets: SECRETS });
    expect(after.ok).toBe(before.ok);
    expect(after.ok).toBe(true);
  });
});
