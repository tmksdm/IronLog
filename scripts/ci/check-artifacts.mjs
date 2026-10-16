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
// `--self-test` proves the check itself is not vacuous: it mutates a copy of the
// artifact (injects a credential for the test build, removes credentials for the
// production build) and fails unless the mutated copy is rejected.
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

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const file of listFiles(from)) {
    const target = resolve(to, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(from, file), target);
  }
}

/**
 * Proves the check is not vacuous: a copy of the artifact is mutated so that it
 * must be rejected. Returns { ok, detail }.
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

  const result = checkArtifact({
    mode: args.mode,
    dir: resolve(args.dir),
    moduleGraph: args.moduleGraph ? resolve(args.moduleGraph) : '',
    secrets,
  });

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

  if (!result.ok) return 1;

  if (args.selfTest) {
    const self = selfTest({
      mode: args.mode,
      dir: resolve(args.dir),
      moduleGraph: args.moduleGraph ? resolve(args.moduleGraph) : '',
      secrets,
    });
    write('');
    write(self.ok ? `Самопроверка: ${self.detail}` : `**Самопроверка не пройдена.** ${self.detail}`);
    if (!self.ok) return 1;
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
