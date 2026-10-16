// scripts/ci/check-artifacts.test.mjs
//
// Tests for the artifact check. They use synthetic credentials, so they stay
// valid when the real key is rotated, and they include the negative cases: a
// deliberately damaged artifact must always be rejected.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { checkArtifact, selfTest } from './check-artifacts.mjs';

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
    overrides.sw ?? 'const CACHE_PREFIX = "ironlog-test-";\nconst APP_SHELL = "./index.html";'
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
    overrides.sw ?? 'const CACHE_PREFIX = "ironlog-";\nconst APP_SHELL = "/IronLog/index.html";'
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
      check('test', testArtifact({ sw: 'const CACHE_PREFIX = "ironlog-";\nconst APP_SHELL = "./index.html";' })).ok
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
      check('production', productionArtifact({ sw: 'const CACHE_PREFIX = "ironlog-test-";\nconst APP_SHELL = "./index.html";' })).ok
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

describe('self test', () => {
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
