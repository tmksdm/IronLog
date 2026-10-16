// src/lib/buildTarget.test.ts
//
// Host guard must fail closed: a build runs only on the hostname that belongs
// to it (plus safe local addresses), and unknown addresses change nothing.

import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_HOSTNAME,
  decideHost,
  isLocalHostname,
} from './buildTarget';

const TEST_HOST = 'ironlog-test.github.io';

const production = (hostname: string, testHostname = TEST_HOST) =>
  decideHost(hostname, 'production', { testHostname });

const test = (hostname: string, testHostname = TEST_HOST) =>
  decideHost(hostname, 'test', { testHostname });

describe('decideHost — production build', () => {
  it('is allowed on the production hostname', () => {
    expect(production(PRODUCTION_HOSTNAME).allowed).toBe(true);
  });

  it('is allowed on safe local addresses', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]', '192.168.1.40', '10.0.0.5', '172.16.4.9']) {
      expect(production(host).allowed, host).toBe(true);
    }
  });

  it('is blocked on the test hostname', () => {
    expect(production(TEST_HOST).allowed).toBe(false);
  });

  it('is blocked on unknown external hostnames', () => {
    for (const host of ['example.com', 'ironlog.pages.dev', 'evil.github.io', '192.169.1.1']) {
      expect(production(host).allowed, host).toBe(false);
    }
  });

  it('is not fooled by lookalike hostnames', () => {
    for (const host of [
      `${PRODUCTION_HOSTNAME}.evil.com`,
      `evil-${PRODUCTION_HOSTNAME}`,
      `x${PRODUCTION_HOSTNAME}`,
      `sub.${PRODUCTION_HOSTNAME}`,
    ]) {
      expect(production(host).allowed, host).toBe(false);
    }
  });

  it('is blocked when the hostname is empty', () => {
    expect(production('').allowed).toBe(false);
    expect(production('   ').allowed).toBe(false);
  });

  it('normalises case and spaces', () => {
    expect(production('TMKSDM.GitHub.IO').allowed).toBe(true);
    expect(production('  tmksdm.github.io  ').allowed).toBe(true);
  });
});

describe('decideHost — test build', () => {
  it('is allowed on the configured test hostname', () => {
    expect(test(TEST_HOST).allowed).toBe(true);
  });

  it('is allowed on safe local addresses', () => {
    for (const host of ['localhost', '127.0.0.1', '192.168.0.7']) {
      expect(test(host).allowed, host).toBe(true);
    }
  });

  it('is blocked on the production hostname', () => {
    const decision = test(PRODUCTION_HOSTNAME);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain(PRODUCTION_HOSTNAME);
  });

  it('is blocked on unknown external hostnames', () => {
    for (const host of ['example.com', 'ironlog-test.pages.dev', 'other-org.github.io']) {
      expect(test(host).allowed, host).toBe(false);
    }
  });

  it('fails closed while the test hostname is not configured', () => {
    for (const host of ['example.com', 'ironlog-test.github.io', PRODUCTION_HOSTNAME]) {
      const decision = test(host, '');
      expect(decision.allowed, host).toBe(false);
      expect(decision.reason).toContain('ещё не задан');
    }
    // Local development stays possible.
    expect(test('localhost', '').allowed).toBe(true);
  });

  it('is blocked when the hostname is empty', () => {
    expect(test('').allowed).toBe(false);
  });

  it('normalises case', () => {
    expect(test('IronLog-Test.GitHub.io').allowed).toBe(true);
  });
});

describe('isLocalHostname', () => {
  it('accepts loopback and private ranges only', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]', '10.1.2.3', '192.168.10.10', '172.31.0.1']) {
      expect(isLocalHostname(host), host).toBe(true);
    }
    for (const host of [
      'tmksdm.github.io',
      'example.com',
      '172.32.0.1',
      '172.15.0.1',
      '11.0.0.1',
      '192.169.0.1',
      'localhost.evil.com',
      '',
    ]) {
      expect(isLocalHostname(host), host).toBe(false);
    }
  });
});
