// scripts/ci/check-artifacts.mjs
//
// Verifies a built bundle against the expectations of its build kind.
//
// Test build  — the cloud must be unreachable and the cloud modules replaced:
//               no production credentials, no Supabase SDK, a CSP with
//               `connect-src 'self'`, the "IronLog Test" manifest, the test
//               service-worker cache prefix and the stub marker.
// Production  — the cloud must still be intact and the test-mode markers must
//               be absent.
//
// Entry closure — the statically reachable closure of the entry chunk must
//               contain the host gate and nothing else from the application: the
//               application, the local database, the cloud modules, the stores
//               and the service-worker registration may only be reached through
//               a dynamic import that the gate performs after the hostname was
//               accepted. This is what makes "nothing runs before the host
//               check" a property of the artifact instead of a hope.
//
// `--self-test` proves the checks themselves are not vacuous: it mutates copies
// of the artifact (injects a credential for the test build, removes credentials
// for the production build, adds static imports to the entry chunk, empties the
// module graph, removes the entry script) and fails unless every mutated copy is
// rejected.
//
// usage: node scripts/ci/check-artifacts.mjs --mode test|production --dir dist
//          [--module-graph <file>] [--self-test] [--summary <file>]

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const STUB_MARKER = 'ironlog-cloud-stub';
const SDK_MARKERS = [
  'GoTrueClient',
  'PostgrestClient',
  'AuthApiError',
  'supabase-js',
  'postgrest',
  'gotrue',
];
const CLOUD_MODULES = {
  realClient: 'lib/supabase.ts',
  stubClient: 'lib/supabase.disabled.ts',
  realSync: 'lib/sync.ts',
  stubSync: 'lib/sync.disabled.ts',
};

/** The entry module and the imports it is allowed to make. */
const ENTRY_SOURCE = 'src/main.tsx';
export const ENTRY_SOURCE_IMPORTS = [
  './components/ui/AppErrorBoundary',
  './components/ui/EntryLoadErrorScreen',
  './components/ui/HostGuard',
  './index.css',
  './lib/buildTarget',
  './lib/entryGate',
  'react',
  'react-dom/client',
];
/** The only dynamic import the entry may contain: the application itself. */
export const ENTRY_DYNAMIC_IMPORTS = ['./App'];
/**
 * Source modules allowed inside the statically reachable closure of the entry.
 * Modules are named the way the module graph names them (relative to `src/`).
 * A new entry dependency is meant to fail here and be added deliberately.
 */
export const ENTRY_CLOSURE_ALLOWLIST = [
  'components/ui/AppErrorBoundary.tsx',
  'components/ui/EntryLoadErrorScreen.tsx',
  'components/ui/HostGuard.tsx',
  'index.css',
  'lib/buildTarget.ts',
  'lib/entryGate.ts',
  'main.tsx',
];
/**
 * Text that must not appear in any chunk of the entry closure. Vendors are not
 * allowed as chunks: whatever the closure reaches is inspected by its content.
 */
const ENTRY_FORBIDDEN_MARKERS = [
  ...SDK_MARKERS,
  'jeep-sqlite',
  'sql-wasm',
  'CapacitorSQLite',
  'SQLiteConnection',
  STUB_MARKER,
];

/** Production credentials, extracted from the source of truth. */
export function extractCloudSecrets(rootDir = REPO_ROOT) {
  const source = readFileSync(resolve(rootDir, 'src/lib/supabase.ts'), 'utf-8');
  const url = source.match(/https:\/\/[a-z0-9-]+\.supabase\.co/)?.[0];
  const key = source.match(/eyJ[A-Za-z0-9_-]{20,}/)?.[0];
  const projectRef = url?.replace('https://', '').split('.')[0];
  if (!url || !key || !projectRef) {
    throw new Error('Не удалось извлечь credentials из src/lib/supabase.ts');
  }
  return { url, projectRef, keyPrefix: key.slice(0, 40) };
}

function listFiles(directory, root = directory) {
  return readdirSync(directory).flatMap((name) => {
    const absolute = resolve(directory, name);
    if (statSync(absolute).isDirectory()) return listFiles(absolute, root);
    return [absolute.slice(root.length + 1).replaceAll('\\', '/')];
  });
}

function readText(dir, file) {
  return readFileSync(resolve(dir, file)).toString('utf-8');
}

function parseModuleGraph(path) {
  if (!path) return null;
  const content = readFileSync(path, 'utf-8');
  return new Set(
    content
      .split('\n')
      .map((line) => line.split('\t')[0]?.trim())
      .filter((value) => value && value.length > 0)
  );
}

/** `module -> chunk` rows, as written by the module graph reporter. */
function parseModuleGraphRows(path) {
  if (!path || !existsSync(path)) return null;
  return readFileSync(path, 'utf-8')
    .split('\n')
    .map((line) => line.split('\t'))
    .filter((parts) => parts.length === 2 && parts[0].trim() && parts[1].trim())
    .map(([module, chunk]) => ({
      module: module.trim(),
      chunk: chunk.trim().replaceAll('\\', '/'),
    }));
}

/** Pure check: no I/O outside the given directory. */
export function checkArtifact({ mode, dir, moduleGraph, secrets = extractCloudSecrets() }) {
  const errors = [];
  const notes = [];

  if (!existsSync(dir)) {
    return { ok: false, errors: [`каталог «${dir}» не существует`], notes };
  }

  const files = listFiles(dir);
  const jsFiles = files.filter((file) => file.endsWith('.js'));
  const buffers = new Map(files.map((file) => [file, readFileSync(resolve(dir, file))]));
  const textByFile = new Map(
    files.map((file) => [file, (buffers.get(file) ?? Buffer.alloc(0)).toString('utf-8')])
  );
  const allText = [...textByFile.values()].join('\n');

  const indexHtml = files.includes('index.html') ? readText(dir, 'index.html') : '';
  const manifestFile = files.find((file) => file === 'manifest.json');
  const manifest = manifestFile ? JSON.parse(readText(dir, manifestFile)) : null;
  const swFile = files.find((file) => file === 'sw.js');
  const sw = swFile ? readText(dir, swFile) : '';

  const graph = parseModuleGraph(moduleGraph);

  if (files.length === 0) errors.push('артефакт пуст');
  if (!indexHtml) errors.push('нет index.html');
  if (!manifest) errors.push('нет manifest.json');
  if (!swFile) errors.push('нет sw.js');

  // The worker is the one part of the shell that lives on after the page closes.
  // It must be able to serve the whole build offline and must never be a source
  // of requests to another origin — the entry gate cannot prevent those.
  if (sw) {
    if (/https?:\/\//.test(sw)) {
      errors.push('sw.js содержит абсолютный внешний URL: worker может обратиться за пределы origin');
    }
    if (!/url\.origin !== self\.location\.origin/.test(sw)) {
      errors.push('в sw.js нет проверки origin запроса');
    }
    const precacheMatch = sw.match(/const PRECACHE_URLS = (\[[^\]]*\]);/);
    let precache = null;
    if (!precacheMatch) {
      errors.push('в sw.js нет списка PRECACHE_URLS: офлайн-запуск не подтверждён');
    } else {
      try {
        precache = JSON.parse(precacheMatch[1]);
      } catch {
        precache = null;
      }
      if (!Array.isArray(precache)) errors.push('PRECACHE_URLS в sw.js не читается как массив');
    }

    if (Array.isArray(precache)) {
      const foreign = precache.filter((url) => /^[a-z]+:|^\/\//i.test(String(url)));
      if (foreign.length > 0) {
        errors.push(`PRECACHE_URLS содержит адреса за пределами origin: ${foreign.join(', ')}`);
      }
      const versionEntry = precache.find((url) => String(url).endsWith('/version.json'));
      if (versionEntry) {
        errors.push(`version.json попал в кэш оболочки (${versionEntry}): проверка обновлений сломается`);
      }

      const appShell = sw.match(/const APP_SHELL = "([^"]+)";/);
      const base = appShell ? appShell[1].replace(/index\.html$/, '') : null;
      if (base !== null) {
        // Everything the build emits under assets/ must be cached, so a new chunk
        // (the application chunk in particular) can never fall out of the offline
        // shell unnoticed.
        const required = files.filter((file) => file.startsWith('assets/'));
        const missing = required.filter((file) => !precache.includes(`${base}${file}`));
        if (missing.length > 0) {
          errors.push(
            `в кэш оболочки не попали файлы сборки (офлайн-запуск потеряет их): ${missing
              .slice(0, 4)
              .join(', ')}`
          );
        }
        const phantom = precache
          .map(String)
          .filter((url) => url.startsWith(base))
          .filter((url) => !files.includes(url.slice(base.length)));
        if (phantom.length > 0) {
          errors.push(`в кэше оболочки есть адреса, которых нет в артефакте: ${phantom.slice(0, 4).join(', ')}`);
        }
        notes.push(
          `service worker: ${precache.length} адресов в кэше, внешних адресов нет, assets покрыты полностью`
        );
      }
    }
  }

  const secretOccurrences = [];
  for (const [file, buffer] of buffers) {
    for (const secret of [secrets.url, secrets.projectRef, secrets.keyPrefix]) {
      if (buffer.includes(Buffer.from(secret))) secretOccurrences.push(`${file} ← ${secret.slice(0, 20)}…`);
    }
  }

  const sdkChunks = jsFiles.filter((file) =>
    SDK_MARKERS.some((marker) => (textByFile.get(file) ?? '').includes(marker))
  );
  const vendorChunks = files.filter((file) => file.includes('supabase-vendor'));

  if (mode === 'test') {
    if (secretOccurrences.length > 0) {
      errors.push(`найдены credentials production Supabase: ${secretOccurrences.join(', ')}`);
    }
    if (sdkChunks.length > 0) {
      errors.push(`найден Supabase SDK в чанках: ${sdkChunks.join(', ')}`);
    }
    if (vendorChunks.length > 0) {
      errors.push(`найден чанк supabase-vendor: ${vendorChunks.join(', ')}`);
    }
    if (!/Content-Security-Policy/.test(indexHtml)) {
      errors.push('в index.html нет меты Content-Security-Policy');
    } else if (!/connect-src 'self'/.test(indexHtml)) {
      errors.push("в CSP нет connect-src 'self'");
    }
    if (manifest) {
      if (manifest.name !== 'IronLog Test' || manifest.short_name !== 'IronLog Test') {
        errors.push(`манифест не тестовый: name=${JSON.stringify(manifest.name)}`);
      }
      if (manifest.start_url !== './' || manifest.scope !== './') {
        errors.push(
          `манифест не для отдельного hostname: start_url=${JSON.stringify(manifest.start_url)} scope=${JSON.stringify(manifest.scope)}`
        );
      }
    }
    if (!/CACHE_PREFIX = "ironlog-test-"/.test(sw)) {
      errors.push('в sw.js нет тестового префикса кэша ironlog-test-');
    }
    if (!/APP_SHELL = ".*index\.html"/.test(sw)) {
      errors.push('в sw.js нет APP_SHELL на index.html');
    }
    if (!/ironlog-test-/.test(sw)) {
      errors.push('sw.js не содержит тестовый префикс');
    }
    if (!files.includes('.nojekyll')) {
      errors.push('нет .nojekyll');
    }
    if (!allText.includes(STUB_MARKER)) {
      errors.push(
        `в артефакте нет маркера заглушки «${STUB_MARKER}» — подмена облачных модулей не подтверждается`
      );
    }
    if (graph) {
      for (const module of [CLOUD_MODULES.stubClient, CLOUD_MODULES.stubSync]) {
        if (!graph.has(module)) errors.push(`в графе модулей нет заглушки ${module}`);
      }
      for (const module of [CLOUD_MODULES.realClient, CLOUD_MODULES.realSync]) {
        if (graph.has(module)) errors.push(`в графе модулей присутствует реальный модуль ${module}`);
      }
      notes.push(`граф модулей: ${graph.size} записей, заглушки подтверждены`);
    } else {
      notes.push('граф модулей не передан: подмена подтверждается только маркером заглушки');
    }
    notes.push(`credentials: ${secretOccurrences.length} вхождений, SDK: ${sdkChunks.length} чанков`);
  } else if (mode === 'production') {
    if (!secretOccurrences.some((entry) => entry.includes(secrets.url.slice(0, 20)))) {
      errors.push('в production-сборке не найдены credentials Supabase — конфигурация потеряна');
    }
    if (sdkChunks.length === 0 && vendorChunks.length === 0) {
      errors.push('в production-сборке нет Supabase SDK — конфигурация потеряна');
    }
    if (/Content-Security-Policy/.test(indexHtml)) {
      errors.push('в production-сборке появилась CSP тестового режима');
    }
    if (manifest) {
      if (manifest.name !== 'IronLog') {
        errors.push(`манифест production изменён: name=${JSON.stringify(manifest.name)}`);
      }
      if (manifest.start_url !== '/IronLog/') {
        errors.push(`start_url production изменён: ${JSON.stringify(manifest.start_url)}`);
      }
    }
    if (!/CACHE_PREFIX = "ironlog-"/.test(sw)) {
      errors.push('в sw.js нет production-префикса кэша ironlog-');
    }
    if (allText.includes(STUB_MARKER)) {
      errors.push('в production-сборке найден маркер тестовой заглушки');
    }
    if (files.includes('.nojekyll')) {
      errors.push('в production-сборке появился .nojekyll тестового режима');
    }
    if (graph) {
      for (const module of [CLOUD_MODULES.realClient, CLOUD_MODULES.realSync]) {
        if (!graph.has(module)) errors.push(`в графе модулей нет реального модуля ${module}`);
      }
      for (const module of [CLOUD_MODULES.stubClient, CLOUD_MODULES.stubSync]) {
        if (graph.has(module)) errors.push(`в графе модулей присутствует заглушка ${module}`);
      }
      notes.push(`граф модулей: ${graph.size} записей, реальные модули подтверждены`);
    } else {
      notes.push('граф модулей не передан');
    }
    notes.push(`credentials: ${secretOccurrences.length} вхождений, SDK: ${sdkChunks.length} чанков`);
  } else {
    errors.push(`неизвестный режим проверки: ${mode}`);
  }

  return { ok: errors.length === 0, errors, notes };
}

/** Sources of `<script type="module">` in the built shell (inline scripts included). */
function moduleScriptSources(html) {
  const values = [];
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\btype="module"/.test(tag)) continue;
    const src = tag.match(/\bsrc="([^"]*)"/);
    values.push(src ? src[1] : '<inline>');
  }
  return values;
}

/** `href`s of `<link rel="modulepreload">` in the built shell. */
function preloadHrefs(html) {
  const values = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\brel="modulepreload"/.test(tag)) continue;
    const href = tag.match(/\bhref="([^"]*)"/);
    if (href) values.push(href[1]);
  }
  return values;
}

/**
 * Maps a URL from the shell (absolute `/IronLog/...`, relative `./...`) to a file
 * inside the artifact. Ambiguous or missing names return null, so the caller can
 * fail closed instead of guessing.
 */
function assetFileFromUrl(files, url) {
  const withoutQuery = url.split('?')[0];
  const base = withoutQuery.split('/').pop();
  if (!base) return null;
  const matches = files.filter((file) => file.split('/').pop() === base);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Static import edges of a built chunk, read from its syntax tree. A dynamic
 * `import(...)` is a call expression and is deliberately not an edge, and neither
 * are the URL strings inside Vite's `__vite__mapDeps` preload table.
 */
function staticChunkEdges(chunkText) {
  const source = ts.createSourceFile(
    'chunk.js',
    chunkText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  const edges = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      edges.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return edges;
}

/** Resolves a relative chunk specifier against the file that contains it. */
function resolveChunkSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const directory = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : '';
  const stack = [];
  for (const part of `${directory}/${specifier}`.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

/**
 * Import specifiers of the entry module, read from its source. TypeScript parses
 * it, so comments, formatting and dynamic calls are never mistaken for imports.
 */
export function readEntryImports(rootDir = REPO_ROOT) {
  const file = resolve(rootDir, ENTRY_SOURCE);
  if (!existsSync(file)) {
    throw new Error(`нет ${ENTRY_SOURCE}: список импортов входа не прочитан`);
  }
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf-8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const staticImports = [];
  const dynamicImports = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      staticImports.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      dynamicImports.push(argument && ts.isStringLiteral(argument) ? argument.text : '<вычисляемый>');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { staticImports, dynamicImports };
}

/**
 * Verifies that nothing but the host gate is statically reachable from the entry
 * chunk. Reads the artifact and the module graph; `entryImports` comes from
 * `readEntryImports` so the source list is checked as well as the built output.
 */
export function checkEntryClosure({
  dir,
  moduleGraph,
  entryImports,
  secrets = extractCloudSecrets(),
}) {
  const errors = [];
  const notes = [];

  if (!existsSync(dir)) {
    return { ok: false, errors: [`каталог «${dir}» не существует`], notes };
  }

  const files = listFiles(dir);
  if (files.length === 0) {
    return { ok: false, errors: ['артефакт пуст: замыкание entry не проверено'], notes };
  }
  const textOf = new Map(files.map((file) => [file, readFileSync(resolve(dir, file), 'utf-8')]));
  const indexHtml = files.includes('index.html') ? textOf.get('index.html') : '';

  // The source list is checked too: the artifact alone cannot show whether an
  // unused import simply fell out of the bundle.
  if (!entryImports) {
    errors.push('список импортов entry не передан: проверка не выполнена (fail-closed)');
  } else {
    const actualStatic = [...new Set(entryImports.staticImports)].sort();
    if (actualStatic.join(', ') !== [...ENTRY_SOURCE_IMPORTS].sort().join(', ')) {
      errors.push(
        `импорты ${ENTRY_SOURCE} изменились и не совпадают с разрешёнными: ${actualStatic.join(', ')}`
      );
    }
    const actualDynamic = [...new Set(entryImports.dynamicImports)].sort();
    if (actualDynamic.join(', ') !== ENTRY_DYNAMIC_IMPORTS.join(', ')) {
      errors.push(
        `динамические импорты ${ENTRY_SOURCE} должны быть ровно ${ENTRY_DYNAMIC_IMPORTS.join(', ')}, ` +
          `найдено: ${actualDynamic.join(', ') || '—'}`
      );
    }
  }

  const scripts = moduleScriptSources(indexHtml);
  if (scripts.length !== 1) {
    errors.push(`в index.html ${scripts.length} module-скриптов, ожидался ровно один`);
    return { ok: false, errors, notes };
  }
  const entry = assetFileFromUrl(files, scripts[0]);
  if (!entry) {
    errors.push(`entry-скрипт из index.html не найден среди файлов артефакта: ${scripts[0]}`);
    return { ok: false, errors, notes };
  }

  const closure = new Set([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const chunk = queue.shift();
    for (const specifier of staticChunkEdges(textOf.get(chunk) ?? '')) {
      const target = resolveChunkSpecifier(chunk, specifier);
      if (!target || !textOf.has(target)) {
        errors.push(`чанк ${chunk} статически ссылается на отсутствующий файл ${specifier}`);
        continue;
      }
      if (!closure.has(target)) {
        closure.add(target);
        queue.push(target);
      }
    }
  }

  const rows = parseModuleGraphRows(moduleGraph);
  const modulesByChunk = new Map();
  if (rows) {
    for (const { module, chunk } of rows) {
      if (!modulesByChunk.has(chunk)) modulesByChunk.set(chunk, []);
      modulesByChunk.get(chunk).push(module);
    }
  }

  if (!rows) {
    errors.push('граф модулей не передан: связь чанков с модулями не проверена (fail-closed)');
  } else if (rows.length === 0) {
    errors.push('граф модулей пуст: замыкание entry не проверено');
  } else {
    const entryModules = modulesByChunk.get(entry) ?? [];
    if (entryModules.length === 0) {
      errors.push(`entry-чанк ${entry} отсутствует в графе модулей: граф неполон`);
    }

    const closureModules = new Set();
    for (const chunk of closure) {
      for (const module of modulesByChunk.get(chunk) ?? []) closureModules.add(module);
    }

    for (const module of [...closureModules].sort()) {
      if (!ENTRY_CLOSURE_ALLOWLIST.includes(module)) {
        errors.push(`в статическом замыкании entry оказался модуль ${module}`);
      }
    }
    for (const module of ENTRY_CLOSURE_ALLOWLIST) {
      if (!closureModules.has(module)) {
        errors.push(
          `в статическом замыкании entry нет модуля ${module}: модуль потерян или граф неполон`
        );
      }
    }
    notes.push(
      `замыкание entry: ${closure.size} чанков, модули: ${[...closureModules].sort().join(', ') || '—'}`
    );
  }

  // Vendors are never allowed by name: their actual text is inspected.
  const forbidden = new Set(ENTRY_FORBIDDEN_MARKERS);
  const credentialValues = [secrets.url, secrets.projectRef, secrets.keyPrefix];
  for (const chunk of closure) {
    const text = textOf.get(chunk) ?? '';
    for (const marker of forbidden) {
      if (text.includes(marker)) errors.push(`чанк замыкания ${chunk} содержит «${marker}»`);
    }
    for (const credential of credentialValues) {
      if (credential && text.includes(credential)) {
        errors.push(`чанк замыкания ${chunk} содержит production credential`);
      }
    }
  }

  const preloads = preloadHrefs(indexHtml);
  for (const href of preloads) {
    const file = assetFileFromUrl(files, href);
    if (!file) {
      errors.push(`modulepreload ссылается на отсутствующий файл: ${href}`);
      continue;
    }
    if (!closure.has(file)) {
      errors.push(`modulepreload ${file} не входит в статическое замыкание entry`);
    }
    for (const module of modulesByChunk.get(file) ?? []) {
      if (!ENTRY_CLOSURE_ALLOWLIST.includes(module)) {
        errors.push(`modulepreload ${file} подтягивает модуль приложения ${module}`);
      }
    }
  }
  notes.push(`modulepreload: ${preloads.length}`);

  return { ok: errors.length === 0, errors, notes };
}

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const file of listFiles(from)) {
    const target = resolve(to, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(from, file), target);
  }
}

/**
 * Proves the entry closure check is not vacuous. Each case gets its own copy of
 * the artifact, and the untouched copy must pass first: a check that fails on
 * everything would otherwise look like a working one.
 * Returns { ok, detail, cases }.
 */
export function selfTestEntryClosure({
  dir,
  moduleGraph,
  entryImports,
  secrets = extractCloudSecrets(),
}) {
  const cases = [];
  const run = (name, mutate) => {
    const temporary = mkdtempSync(join(tmpdir(), 'ironlog-entry-closure-'));
    let graphPath = moduleGraph;
    try {
      copyDir(dir, temporary);
      if (mutate) {
        const result = mutate({
          dir: temporary,
          moduleGraph,
          copyGraph: (content) => {
            graphPath = resolve(temporary, 'module-graph.txt');
            writeFileSync(graphPath, content);
          },
        });
        if (result) {
          cases.push({ name, ok: false, detail: result });
          return;
        }
      }
      const result = checkEntryClosure({
        dir: temporary,
        moduleGraph: graphPath,
        entryImports,
        secrets,
      });
      const expected = name === 'неповреждённый артефакт';
      const passed = expected ? result.ok : !result.ok;
      cases.push({
        name,
        ok: passed,
        detail: expected
          ? result.ok
            ? 'принят'
            : `отклонён: ${result.errors[0]}`
          : result.ok
            ? 'повреждение не обнаружено'
            : `отклонён: ${result.errors[0]}`,
      });
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  };

  const files = existsSync(dir) ? listFiles(dir) : [];
  const textOf = new Map(
    files.map((file) => [file, readFileSync(resolve(dir, file), 'utf-8')])
  );
  const indexHtml = files.includes('index.html') ? textOf.get('index.html') : '';
  const scripts = moduleScriptSources(indexHtml);
  const entry = scripts.length === 1 ? assetFileFromUrl(files, scripts[0]) : null;
  const rows = parseModuleGraphRows(moduleGraph) ?? [];
  const appChunk = rows.find((row) => row.module === 'App.tsx')?.chunk ?? null;
  const chunksInGraph = new Set(rows.map((row) => row.chunk));
  // A vendor chunk carries no source modules, so only the content check can
  // reject it — that is the rule the next case is meant to exercise.
  const forbiddenChunk =
    files.find(
      (file) =>
        file.endsWith('.js') &&
        !chunksInGraph.has(file) &&
        ENTRY_FORBIDDEN_MARKERS.some((marker) => (textOf.get(file) ?? '').includes(marker))
    ) ?? null;

  if (!entry) {
    return { ok: false, detail: 'entry-чанк не найден: самопроверка не выполнена', cases };
  }

  run('неповреждённый артефакт', null);

  if (appChunk) {
    run('статический импорт app-чанка в entry', ({ dir: temporary }) => {
      const file = resolve(temporary, entry);
      writeFileSync(file, `${readFileSync(file, 'utf-8')}\nimport "./${appChunk.split('/').pop()}";\n`);
      return null;
    });
  } else {
    cases.push({ name: 'статический импорт app-чанка в entry', ok: false, detail: 'app-чанк не найден в графе' });
  }

  if (forbiddenChunk) {
    run('статический импорт вендорного чанка с запрещённым содержимым', ({ dir: temporary }) => {
      const file = resolve(temporary, entry);
      writeFileSync(file, `${readFileSync(file, 'utf-8')}\nimport "./${forbiddenChunk.split('/').pop()}";\n`);
      return null;
    });
  } else {
    cases.push({
      name: 'статический импорт вендорного чанка с запрещённым содержимым',
      ok: false,
      detail: 'чанк с запрещённым содержимым не найден',
    });
  }

  run('неполный граф модулей', ({ moduleGraph: graph, copyGraph }) => {
    if (!graph) return 'граф модулей не передан';
    const rows = parseModuleGraphRows(graph) ?? [];
    const filtered = rows.filter((row) => row.module !== 'lib/entryGate.ts');
    if (filtered.length === rows.length) return 'модуль lib/entryGate.ts отсутствует в графе';
    copyGraph(`${filtered.map((row) => `${row.module}\t${row.chunk}`).join('\n')}\n`);
    return null;
  });

  if (appChunk) {
    run('modulepreload для app-чанка', ({ dir: temporary }) => {
      const file = resolve(temporary, 'index.html');
      if (!existsSync(file)) return 'в артефакте нет index.html';
      const href = `./${appChunk}`;
      writeFileSync(
        file,
        readFileSync(file, 'utf-8').replace(
          '</head>',
          `<link rel="modulepreload" crossorigin href="${href}" /></head>`
        )
      );
      return null;
    });
  } else {
    cases.push({ name: 'modulepreload для app-чанка', ok: false, detail: 'app-чанк не найден в графе' });
  }

  run('нет module-скрипта в index.html', ({ dir: temporary }) => {
    const file = resolve(temporary, 'index.html');
    if (!existsSync(file)) return 'в артефакте нет index.html';
    writeFileSync(file, readFileSync(file, 'utf-8').replace(/<script\b[^>]*type="module"[^>]*><\/script>/gi, ''));
    return null;
  });

  const failed = cases.filter((item) => !item.ok);
  const detail =
    failed.length === 0
      ? `все случаи обработаны: ${cases.map((item) => item.name).join('; ')}`
      : `не сработали: ${failed.map((item) => `${item.name} (${item.detail})`).join('; ')}`;
  return { ok: failed.length === 0, detail, cases };
}
/**
 * Proves the mode check is not vacuous: a copy of the artifact is mutated so that
 * it must be rejected. Returns { ok, detail }.
 */
export function selfTest({ mode, dir, moduleGraph, secrets = extractCloudSecrets() }) {
  const temporary = mkdtempSync(join(tmpdir(), `ironlog-self-test-${mode}-`));
  try {
    copyDir(dir, temporary);
    const files = listFiles(temporary);
    const jsFiles = files.filter((file) => file.endsWith('.js'));
    if (jsFiles.length === 0) return { ok: false, detail: 'в артефакте нет JS-файлов' };

    if (mode === 'test') {
      const target = jsFiles[0];
      const content = readFileSync(resolve(temporary, target), 'utf-8');
      writeFileSync(
        resolve(temporary, target),
        `${content}\n/* self-test injection */ const leaked = '${secrets.url}';\n`
      );
    } else {
      let replacements = 0;
      for (const file of [...jsFiles, ...files.filter((f) => f.endsWith('.html'))]) {
        const content = readFileSync(resolve(temporary, file), 'utf-8');
        let stripped = content;
        for (const secret of [secrets.url, secrets.projectRef, secrets.keyPrefix]) {
          const parts = stripped.split(secret);
          replacements += parts.length - 1;
          stripped = parts.join('');
        }
        if (stripped !== content) writeFileSync(resolve(temporary, file), stripped);
      }
      if (replacements === 0) {
        return { ok: false, detail: 'нечего удалять: в артефакте не было credentials' };
      }
    }

    const result = checkArtifact({ mode, dir: temporary, moduleGraph, secrets });
    if (result.ok) {
      return { ok: false, detail: 'повреждённый артефакт был принят проверкой' };
    }
    return { ok: true, detail: `повреждённый артефакт отклонён: ${result.errors[0]}` };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const args = { mode: '', dir: 'dist', moduleGraph: '', summary: '', selfTest: false };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--mode') args.mode = argv[++i] ?? '';
    else if (value === '--dir') args.dir = argv[++i] ?? '';
    else if (value === '--module-graph') args.moduleGraph = argv[++i] ?? '';
    else if (value === '--summary') args.summary = argv[++i] ?? '';
    else if (value === '--self-test') args.selfTest = true;
  }
  return args;
}

export function runCli(argv) {
  const args = parseArgs(argv);
  const write = (line) => {
    console.log(line);
    if (args.summary) {
      try {
        writeFileSync(args.summary, `${line}\n`, { flag: 'a' });
      } catch (error) {
        console.error(`Не удалось записать summary: ${error.message}`);
      }
    }
  };

  if (!args.mode || !args.dir) {
    write('usage: check-artifacts.mjs --mode test|production --dir <dir> [--module-graph <file>] [--self-test]');
    return 2;
  }

  let secrets;
  try {
    secrets = extractCloudSecrets();
  } catch (error) {
    write('## Проверка артефакта');
    write('');
    write(`**Проверка не пройдена (fail-closed).** ${error.message}`);
    return 1;
  }

  const dir = resolve(args.dir);
  const moduleGraph = args.moduleGraph ? resolve(args.moduleGraph) : '';

  const result = checkArtifact({ mode: args.mode, dir, moduleGraph, secrets });

  write(`## Проверка артефакта — режим ${args.mode}`);
  write('');
  write(result.ok ? 'Артефакт соответствует режиму сборки.' : '**Проверка не пройдена.**');
  write('');
  for (const note of result.notes) write(`- ${note}`);
  if (result.errors.length > 0) {
    write('');
    write('### Найденные проблемы');
    for (const error of result.errors) write(`- ${error}`);
  }

  let entryImports = null;
  let importProblem = '';
  try {
    entryImports = readEntryImports();
  } catch (error) {
    importProblem = error.message;
  }
  const closure = importProblem
    ? { ok: false, errors: [importProblem], notes: [] }
    : checkEntryClosure({ dir, moduleGraph, entryImports, secrets });

  write('');
  write('## Изоляция entry — статическое замыкание');
  write('');
  write(
    closure.ok
      ? 'Из entry статически достижим только ранний гейт.'
      : '**Проверка не пройдена.**'
  );
  write('');
  for (const note of closure.notes) write(`- ${note}`);
  if (closure.errors.length > 0) {
    write('');
    write('### Найденные проблемы');
    for (const error of closure.errors) write(`- ${error}`);
  }

  if (!result.ok || !closure.ok) return 1;

  if (args.selfTest) {
    const self = selfTest({ mode: args.mode, dir, moduleGraph, secrets });
    write('');
    write(self.ok ? `Самопроверка режима: ${self.detail}` : `**Самопроверка режима не пройдена.** ${self.detail}`);
    if (!self.ok) return 1;

    const closureSelf = selfTestEntryClosure({ dir, moduleGraph, entryImports, secrets });
    write('');
    write(
      closureSelf.ok
        ? '**Самопроверка замыкания entry:** каждое повреждение отклонено'
        : `**Самопроверка замыкания entry не пройдена.** ${closureSelf.detail}`
    );
    for (const item of closureSelf.cases) {
      write(`- ${item.ok ? '✅' : '❌'} ${item.name}: ${item.detail}`);
    }
    if (!closureSelf.ok) return 1;
  }

  return 0;
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  process.argv[1] !== '' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = runCli(process.argv);
}
