// scripts/ci/supabaseSurface.test.mjs
//
// Tests for the Supabase surface check.
//
// The negative cases run over synthetic programs built in memory, so nothing is
// written to disk, and every one of them is paired with a clean twin: a violation
// can only come from the forbidden access itself, never from the fixture or from
// the analyzer failing on the whole file.

import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import {
  analyzeProgram,
  analyzeSurface,
  parseSubstitutedModules,
  readSubstitutedModules,
  runCli,
} from './supabaseSurface.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BACKSLASH = String.fromCharCode(92);
const normalize = (filePath) => filePath.replaceAll(BACKSLASH, '/');

// The synthetic client mimics the production module: full surface, `from` usable.
const CLIENT_MODULE = `
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: (_callback: (event: never, session: never) => void) => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
    signInWithPassword: async (_credentials: { email: string; password: string }) => ({
      error: new Error('stub'),
    }),
    signOut: async () => ({ error: null }),
  },
  from: (_table: string) => ({ select: () => ({}) }),
};
`;

// The synthetic stub mirrors src/lib/supabase.disabled.ts, `from(): never` included.
const STUB_MODULE = `
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: (_callback: (event: never, session: never) => void) => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
    signInWithPassword: async (_credentials: { email: string; password: string }) => ({
      error: new Error('stub'),
    }),
    signOut: async () => ({ error: null }),
  },
  from(_table: string): never {
    throw new Error('stub');
  },
};
`;

const VIRTUAL_ROOT = '/virtual';

function createVirtualProgram(sources) {
  const files = new Map(
    Object.entries(sources).map(([name, text]) => [normalize(name), text])
  );
  const options = {
    strict: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  };

  const host = ts.createCompilerHost(options);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  const defaultFileExists = host.fileExists.bind(host);
  const defaultReadFile = host.readFile.bind(host);
  const defaultDirectoryExists = host.directoryExists?.bind(host);

  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = files.get(normalize(fileName));
    if (text !== undefined) {
      return ts.createSourceFile(fileName, text, languageVersion, true);
    }
    return defaultGetSourceFile(fileName, languageVersion, onError, shouldCreate);
  };
  host.fileExists = (fileName) => files.has(normalize(fileName)) || defaultFileExists(fileName);
  host.readFile = (fileName) => files.get(normalize(fileName)) ?? defaultReadFile(fileName);
  // Without this the virtual directory does not exist for module resolution and
  // `import { supabase } from './client'` silently becomes `any`.
  host.directoryExists = (directory) =>
    normalize(directory) === VIRTUAL_ROOT || (defaultDirectoryExists?.(directory) ?? false);
  host.getDirectories = () => [];
  host.realpath = (fileName) => fileName;
  host.writeFile = () => {};

  return ts.createProgram([...files.keys()], options, host);
}

function analyzeSources(consumerSource, { exempt = [] } = {}) {
  const program = createVirtualProgram({
    '/virtual/client.ts': CLIENT_MODULE,
    '/virtual/stub.ts': STUB_MODULE,
    '/virtual/consumer.ts': consumerSource,
  });
  return analyzeProgram({
    program,
    clientModuleFile: '/virtual/client.ts',
    stubModuleFile: '/virtual/stub.ts',
    exemptModuleFiles: exempt,
    rootDir: '/virtual',
  });
}

const kindsOf = (result) => result.violations.map((violation) => violation.kind);

const IMPORT = "import { supabase } from './client';\n";

describe('substituted module list', () => {
  it('reads the pairs from the real build configuration', () => {
    const entries = readSubstitutedModules(REPO_ROOT);
    expect(entries.map((entry) => entry.original)).toEqual([
      'src/lib/supabase.ts',
      'src/lib/sync.ts',
      'src/components/settings/SyncDiagnostics.tsx',
    ]);
    expect(entries.map((entry) => entry.stub)).toEqual([
      'src/lib/supabase.disabled.ts',
      'src/lib/sync.disabled.ts',
      'src/components/settings/SyncDiagnostics.disabled.tsx',
    ]);
  });

  it('fails closed when the declaration is missing', () => {
    expect(() => parseSubstitutedModules('const other = 1;')).toThrow(
      /не удалось прочитать TEST_BUILD_MODULE_STUBS/
    );
  });

  it('fails closed on an empty list', () => {
    expect(() => parseSubstitutedModules('const TEST_BUILD_MODULE_STUBS = [];')).toThrow(
      /пуст/
    );
  });

  it('fails closed on a malformed pair', () => {
    expect(() =>
      parseSubstitutedModules("const TEST_BUILD_MODULE_STUBS = [['a.ts']];")
    ).toThrow(/из пар/);
    expect(() =>
      parseSubstitutedModules("const TEST_BUILD_MODULE_STUBS = [[1, 'b.ts']];")
    ).toThrow(/строковые пути/);
  });
});

describe('the real project surface', () => {
  const result = analyzeSurface({ repoRoot: REPO_ROOT });

  it('has no unsupported access', () => {
    expect(result.violations).toEqual([]);
  });

  it('uses exactly the surface the stub provides', () => {
    // A new legitimate call is meant to fail here: it is a deliberate review
    // point, and the analyzer must see it before the test build does.
    expect(result.chains.map((chain) => chain.path).sort()).toEqual([
      'auth.getSession',
      'auth.onAuthStateChange',
      'auth.signInWithPassword',
      'auth.signOut',
    ]);
  });

  it('exempts the substituted modules, their stubs and the contract', () => {
    expect(result.exempt).toEqual(
      expect.arrayContaining([
        normalize(resolve(REPO_ROOT, 'src/lib/supabase.ts')),
        normalize(resolve(REPO_ROOT, 'src/lib/supabase.disabled.ts')),
        normalize(resolve(REPO_ROOT, 'src/lib/sync.ts')),
        normalize(resolve(REPO_ROOT, 'src/lib/sync.disabled.ts')),
        normalize(resolve(REPO_ROOT, 'src/components/settings/SyncDiagnostics.tsx')),
        normalize(resolve(REPO_ROOT, 'src/components/settings/SyncDiagnostics.disabled.tsx')),
        normalize(resolve(REPO_ROOT, 'src/lib/cloudStubContract.ts')),
      ])
    );
  });

  it('examined a meaningful number of files', () => {
    // A program that failed to load would otherwise look like a clean project.
    expect(result.stats.filesAnalyzed).toBeGreaterThan(50);
  });
});

describe('supported access is accepted', () => {
  it('accepts a direct call', () => {
    const result = analyzeSources(
      `${IMPORT}export async function load() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}`
    );
    expect(result.violations).toEqual([]);
    expect(result.chains.map((chain) => chain.path)).toEqual(['auth.getSession']);
  });

  it('accepts a literal element access', () => {
    const result = analyzeSources(
      `${IMPORT}export async function load() {
  return supabase['auth'].getSession();
}`
    );
    expect(result.violations).toEqual([]);
  });

  it('accepts an unqualified reference inside an exempt module', () => {
    const result = analyzeSources(
      `${IMPORT}export function read() {
  return supabase.from('exercises').select('*');
}`,
      { exempt: ['/virtual/consumer.ts'] }
    );
    expect(result.violations).toEqual([]);
    // The file was skipped, not analyzed and forgiven.
    expect(result.stats.filesAnalyzed).toBe(0);
  });
});

describe('forbidden access is detected', () => {
  it('reports a member the stub does not have', () => {
    const result = analyzeSources(
      `${IMPORT}export function load() {
  return supabase.auth.getUser();
}`
    );
    expect(kindsOf(result)).toEqual(['unsupported-member']);
    expect(result.violations[0].message).toContain('auth.getUser');
    expect(result.violations[0].file.endsWith('/virtual/consumer.ts')).toBe(true);
    expect(result.violations[0].line).toBe(3);
  });

  it('reports the fail-closed table access', () => {
    const result = analyzeSources(
      `${IMPORT}export function read() {
  return supabase.from('exercises').select('*');
}`
    );
    expect(kindsOf(result)).toEqual(['fail-closed-member']);
    expect(result.violations[0].message).toContain('from');
  });

  it('follows an import alias', () => {
    const result = analyzeSources(`import { supabase as sb } from './client';
export function load() {
  return sb.auth.getUser();
}`);
    expect(kindsOf(result)).toEqual(['unsupported-member']);
  });

  it('follows a namespace import', () => {
    const result = analyzeSources(`import * as cloud from './client';
export function load() {
  return cloud.supabase.auth.getUser();
}`);
    expect(kindsOf(result)).toEqual(['unsupported-member']);
  });

  it('sees through a non-null assertion', () => {
    const result = analyzeSources(
      `${IMPORT}export function load() {
  return supabase!.auth.getUser();
}`
    );
    expect(kindsOf(result)).toEqual(['unsupported-member']);
  });

  it('sees through a literal element access', () => {
    const result = analyzeSources(
      `${IMPORT}export function load() {
  return supabase['auth'].getUser();
}`
    );
    expect(kindsOf(result)).toEqual(['unsupported-member']);
  });

  it('rejects destructuring the client instead of skipping it', () => {
    const result = analyzeSources(
      `${IMPORT}const { auth } = supabase;
export function load() {
  return auth.getSession();
}`
    );
    expect(kindsOf(result)).toEqual(['unanalyzable-form']);
  });

  it('rejects passing the client around', () => {
    const result = analyzeSources(
      `${IMPORT}export function register(use: (client: unknown) => void) {
  use(supabase);
}`
    );
    expect(kindsOf(result)).toEqual(['unanalyzable-form']);
  });

  it('rejects assigning the client to a local alias', () => {
    const result = analyzeSources(
      `${IMPORT}const client = supabase;
export function load() {
  return client.auth.getSession();
}`
    );
    // The assignment itself is the unsupported form (reported at the declaration
    // and at the initializer), so an alias can never hide a later call.
    expect(kindsOf(result)).toContain('unanalyzable-form');
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('rejects a computed key', () => {
    const result = analyzeSources(
      `${IMPORT}export function pick(key: string) {
  return supabase[key];
}`
    );
    expect(kindsOf(result)).toEqual(['unanalyzable-form']);
  });
});

describe('intermediate objects of the client are not followed', () => {
  it('rejects saving the auth object and calling a forbidden member through it', () => {
    const result = analyzeSources(`import { supabase } from './client';
const auth = supabase.auth;
export function load() {
  return auth.getUser();
}`);
    expect(kindsOf(result)).toContain('unanalyzable-form');
    // Reported where the object is detached, so the later call can never slip by.
    expect(result.violations[0].line).toBe(2);
  });

  it('rejects saving the auth object even when the later call is supported', () => {
    const result = analyzeSources(`import { supabase } from './client';
const auth = supabase.auth;
export function load() {
  return auth.getSession();
}`);
    expect(kindsOf(result)).toContain('unanalyzable-form');
  });

  it('still accepts the same path when it is called directly', () => {
    const result = analyzeSources(
      `${IMPORT}export function load() {
  return supabase.auth.getSession();
}`
    );
    expect(result.violations).toEqual([]);
  });

  it('rejects passing the auth object into a function', () => {
    const result = analyzeSources(`${IMPORT}export function register(use: (auth: unknown) => void) {
  use(supabase.auth);
}`);
    expect(kindsOf(result)).toEqual(['unanalyzable-form']);
  });

  it('rejects destructuring methods out of the auth object', () => {
    const result = analyzeSources(`${IMPORT}const { getSession } = supabase.auth;
export function load() {
  return getSession();
}`);
    expect(kindsOf(result)).toEqual(['unanalyzable-form']);
  });

  it('rejects taking a method reference instead of calling it', () => {
    const result = analyzeSources(
      `${IMPORT}export const signOut = supabase.auth.signOut;`
    );
    expect(kindsOf(result)).toEqual(['unanalyzable-form']);
  });
});

describe('the analyzer fails closed on its own inputs', () => {
  it('refuses a client module without the export', () => {
    const program = createVirtualProgram({
      '/virtual/client.ts': 'export const other = 1;\n',
      '/virtual/stub.ts': STUB_MODULE,
      '/virtual/consumer.ts': 'export const nothing = 1;\n',
    });
    expect(() =>
      analyzeProgram({
        program,
        clientModuleFile: '/virtual/client.ts',
        stubModuleFile: '/virtual/stub.ts',
        rootDir: '/virtual',
      })
    ).toThrow(/не экспортируют/);
  });

  it('refuses a program without the stub module', () => {
    const program = createVirtualProgram({
      '/virtual/client.ts': CLIENT_MODULE,
      '/virtual/consumer.ts': 'export const nothing = 1;\n',
    });
    expect(() =>
      analyzeProgram({
        program,
        clientModuleFile: '/virtual/client.ts',
        stubModuleFile: '/virtual/stub.ts',
        rootDir: '/virtual',
      })
    ).toThrow(/не найдены модули/);
  });
});

describe('command line verdicts', () => {
  const silent = () => {};

  it('passes on a checked surface', () => {
    const code = runCli([], {
      log: silent,
      analyze: () => ({
        violations: [],
        chains: [{ path: 'auth.getSession', file: 'file' }],
        stats: { filesAnalyzed: 1, chainsAnalyzed: 1, segmentsChecked: 2 },
      }),
    });
    expect(code).toBe(0);
  });

  it('fails on a violation', () => {
    const lines = [];
    const code = runCli([], {
      log: (line) => lines.push(line),
      analyze: () => ({
        violations: [
          {
            file: 'src/pages/Example.tsx',
            line: 3,
            column: 5,
            kind: 'unsupported-member',
            message: '«auth.getUser» отсутствует в тестовой заглушке',
          },
        ],
        chains: [],
        stats: { filesAnalyzed: 1, chainsAnalyzed: 1, segmentsChecked: 1 },
      }),
    });
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('src/pages/Example.tsx:3:5 [unsupported-member]');
  });

  it('fails when it sees no cloud access at all', () => {
    const lines = [];
    const code = runCli([], {
      log: (line) => lines.push(line),
      analyze: () => ({
        violations: [],
        chains: [],
        stats: { filesAnalyzed: 0, chainsAnalyzed: 0, segmentsChecked: 0 },
      }),
    });
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('выродилась');
  });
});
