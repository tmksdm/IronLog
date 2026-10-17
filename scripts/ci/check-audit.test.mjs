// scripts/ci/check-audit.test.mjs
//
// Automated tests for the audit completeness checker. They run with the regular
// `npm test` (vitest) and therefore inside CI.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkAuditReport, parseAuditReport, runCli } from './check-audit.mjs';

const SCRIPT = fileURLToPath(new URL('./check-audit.mjs', import.meta.url));
const ALLOWLIST = JSON.parse(
  readFileSync(new URL('./known-audit-advisories.json', import.meta.url), 'utf8')
);

const advisory = (id, severity) => ({
  url: `https://github.com/advisories/${id}`,
  severity,
  title: `${id} title`,
});

/** Builds a report and computes metadata from its packages unless overridden. */
function report(packages, metadataOverrides = {}, topLevel = {}) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  for (const record of Object.values(packages)) {
    counts[record.severity] += 1;
    counts.total += 1;
  }
  return {
    auditReportVersion: 2,
    metadata: { vulnerabilities: { ...counts, ...metadataOverrides } },
    vulnerabilities: packages,
    ...topLevel,
  };
}

/** Faithful replica of the live report shape as of 2026-10-16. */
function liveShapedReport() {
  return report({
    '@humanfs/node': {
      name: '@humanfs/node',
      severity: 'moderate',
      via: [advisory('GHSA-p498-v437-472g', 'moderate')],
    },
    'brace-expansion': {
      name: 'brace-expansion',
      severity: 'high',
      via: [
        advisory('GHSA-q2hr-2g5m-vwhr', 'moderate'),
        advisory('GHSA-qhr7-859c-m2p7', 'high'),
        advisory('GHSA-6j4f-fj2g-mc7p', 'high'),
      ],
    },
    'source-map-js': {
      name: 'source-map-js',
      severity: 'high',
      via: [advisory('GHSA-68fv-2mgg-jv7q', 'high')],
    },
  });
}

const check = (audit, allowlist = ALLOWLIST) => checkAuditReport(audit, allowlist);

describe('checkAuditReport — known and new problems', () => {
  it('passes when every advisory is in the known list', () => {
    const result = check(liveShapedReport());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.stats.packages).toBe(3);
    expect(result.stats.advisories).toBe(5);
  });

  it('fails on an advisory that is not in the list', () => {
    const audit = liveShapedReport();
    audit.vulnerabilities['left-pad'] = {
      name: 'left-pad',
      severity: 'high',
      via: [advisory('GHSA-9999-zzzz-0001', 'high')],
    };
    const result = check(report(audit.vulnerabilities));
    expect(result.ok).toBe(false);
    expect(result.stats.unknownAdvisories).toBe(1);
    expect(result.markdown).toContain('GHSA-9999-zzzz-0001');
  });

  it('fails when a known advisory becomes more severe', () => {
    const audit = liveShapedReport();
    audit.vulnerabilities['@humanfs/node'].via = [advisory('GHSA-p498-v437-472g', 'critical')];
    const result = check(audit);
    expect(result.ok).toBe(false);
    expect(result.stats.escalated).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.markdown).toContain('moderate → critical');
  });

  it('keeps packages and advisories as distinct entities', () => {
    const result = check(liveShapedReport());
    expect(result.stats.packages).not.toBe(result.stats.advisories);
    expect(result.markdown).toContain('Это разные сущности');
  });

  it('collapses duplicate advisory references without hiding them', () => {
    // npm repeats each advisory object in `via` once per affected range.
    const result = check(
      report({
        'brace-expansion': {
          name: 'brace-expansion',
          severity: 'high',
          via: [
            advisory('GHSA-q2hr-2g5m-vwhr', 'moderate'),
            advisory('GHSA-q2hr-2g5m-vwhr', 'moderate'),
            advisory('GHSA-qhr7-859c-m2p7', 'high'),
            advisory('GHSA-qhr7-859c-m2p7', 'high'),
            advisory('GHSA-6j4f-fj2g-mc7p', 'high'),
            advisory('GHSA-6j4f-fj2g-mc7p', 'high'),
          ],
        },
      })
    );
    expect(result.ok).toBe(true);
    expect(result.stats.packages).toBe(1);
    expect(result.stats.advisories).toBe(3);
    expect(result.stats.advisoryReferences).toBe(6);
    expect(result.markdown).toContain('ссылок на advisory в отчёте — 6');
  });

  it('keeps the worst severity of a repeated advisory', () => {
    const audit = liveShapedReport();
    audit.vulnerabilities['brace-expansion'].via = [
      advisory('GHSA-qhr7-859c-m2p7', 'moderate'),
      advisory('GHSA-qhr7-859c-m2p7', 'critical'),
    ];
    const result = check(audit);
    expect(result.ok).toBe(false);
    expect(result.stats.escalated).toBe(1);
    expect(result.markdown).toContain('high → critical');
  });

  it('warns about a stale list entry but still passes', () => {
    const allowlist = {
      ...ALLOWLIST,
      entries: [
        ...ALLOWLIST.entries,
        { package: 'phantom-pkg', advisory: 'GHSA-phantom-0000', severity: 'low' },
      ],
    };
    const result = check(liveShapedReport(), allowlist);
    expect(result.ok).toBe(true);
    expect(result.stats.stale).toBe(1);
    expect(result.markdown).toContain('которых больше нет в отчёте');
  });
});

describe('checkAuditReport — string and unsupported via entries', () => {
  it('handles a string via that links to a known vulnerable package', () => {
    const audit = liveShapedReport();
    audit.vulnerabilities['glob'] = {
      name: 'glob',
      severity: 'high',
      via: ['brace-expansion'],
    };
    const result = check(report(audit.vulnerabilities));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    // The link-only package must be reported, never skipped silently.
    expect(result.stats.transitivePackages).toBe(1);
    expect(result.markdown).toContain('покрытые транзитивно');
  });

  it('fails when a string via points to a package missing from the report', () => {
    const audit = liveShapedReport();
    audit.vulnerabilities['glob'] = {
      name: 'glob',
      severity: 'high',
      via: ['not-in-report'],
    };
    const result = check(report(audit.vulnerabilities));
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('not-in-report');
  });

  it('fails when an advisory entry has no url', () => {
    const audit = liveShapedReport();
    audit.vulnerabilities['brace-expansion'].via.push({ severity: 'high', title: 'no url' });
    const result = check(audit);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('без url');
  });

  it('fails on an unsupported via entry type', () => {
    for (const bad of [42, null, true, ['nested']]) {
      const audit = liveShapedReport();
      audit.vulnerabilities['brace-expansion'].via.push(bad);
      const result = check(audit);
      expect(result.ok, `via = ${JSON.stringify(bad)}`).toBe(false);
      expect(result.errors.join(' ')).toContain('неподдерживаемая запись via');
    }
  });

  it('fails when via is empty or not an array', () => {
    const empty = liveShapedReport();
    empty.vulnerabilities['brace-expansion'].via = [];
    expect(check(empty).ok).toBe(false);

    const notArray = liveShapedReport();
    notArray.vulnerabilities['brace-expansion'].via = 'brace-expansion';
    expect(check(notArray).ok).toBe(false);
  });

  it('fails when a link-only package is stricter than the package it points at', () => {
    const audit = liveShapedReport();
    audit.vulnerabilities['glob'] = { name: 'glob', severity: 'critical', via: ['source-map-js'] };
    const result = check(report(audit.vulnerabilities));
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('строже связанных');
  });
});

describe('checkAuditReport — severity handling', () => {
  it('never treats an unknown severity as info', () => {
    const audit = liveShapedReport();
    audit.vulnerabilities['left-pad'] = {
      name: 'left-pad',
      severity: 'weird',
      via: [advisory('GHSA-9999-zzzz-0002', 'high')],
    };
    const result = check(audit);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('неизвестная severity');
    expect(result.stats?.computedCounts?.info).toBe(0);
  });

  it('fails on an unknown advisory severity', () => {
    const audit = liveShapedReport();
    audit.vulnerabilities['brace-expansion'].via.push({
      url: 'https://github.com/advisories/GHSA-0000-0000-0001',
      severity: 'severe',
    });
    const result = check(audit);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('неизвестная severity у advisory');
  });

  it('fails on an unknown severity inside the allowlist', () => {
    const allowlist = {
      ...ALLOWLIST,
      entries: [
        { package: 'brace-expansion', advisory: 'GHSA-q2hr-2g5m-vwhr', severity: 'severe' },
      ],
    };
    const result = check(liveShapedReport(), allowlist);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('неизвестная severity: "severe"');
  });
});

describe('checkAuditReport — malformed, incomplete and failed reports', () => {
  it('fails when metadata is missing', () => {
    const audit = liveShapedReport();
    delete audit.metadata;
    expect(check(audit).ok).toBe(false);
  });

  it('fails when vulnerabilities is missing but counters are non-zero', () => {
    const audit = liveShapedReport();
    delete audit.vulnerabilities;
    const result = check(audit);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('vulnerabilities');
  });

  it('fails on an empty report with non-zero counters', () => {
    const audit = report({}, { moderate: 1, high: 2, total: 3 });
    const result = check(audit);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('total = 3');
  });

  it('fails when metadata counters disagree with the package records', () => {
    const audit = liveShapedReport();
    audit.metadata.vulnerabilities.total = 4;
    const result = check(audit);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('total = 4');
  });

  it('fails when a severity counter disagrees', () => {
    const audit = liveShapedReport();
    audit.metadata.vulnerabilities.high = 3;
    const result = check(audit);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('high = 3');
  });

  it('fails when the report carries an npm error payload', () => {
    const result = check({ error: { code: 'ENETUNREACH', summary: 'network unreachable' } });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('ENETUNREACH');
  });

  it('fails when a package record is not an object', () => {
    const audit = liveShapedReport();
    audit.vulnerabilities['broken'] = 'oops';
    expect(check(audit).ok).toBe(false);
  });

  it('fails on a non-integer severity counter', () => {
    const audit = liveShapedReport();
    audit.metadata.vulnerabilities.low = '0';
    expect(check(audit).ok).toBe(false);
  });

  it('fails when metadata.vulnerabilities is not an object', () => {
    const audit = liveShapedReport();
    audit.metadata.vulnerabilities = [];
    expect(check(audit).ok).toBe(false);
  });
});

describe('parseAuditReport', () => {
  it('rejects an empty file', () => {
    expect(parseAuditReport('').error).toContain('пуст');
    expect(parseAuditReport('   \n').error).toContain('пуст');
  });

  it('rejects corrupted JSON', () => {
    expect(parseAuditReport('{ not json').error).toContain('не является корректным JSON');
  });

  it('rejects a non-object payload', () => {
    expect(parseAuditReport('[]').error).toContain('не является объектом');
    expect(parseAuditReport('"text"').error).toContain('не является объектом');
  });

  it('accepts a valid object', () => {
    expect(parseAuditReport('{"metadata":{}}').audit).toEqual({ metadata: {} });
  });
});

describe('CLI', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ironlog-audit-'));
  const allowlistPath = join(tmp, 'known.json');
  writeFileSync(allowlistPath, JSON.stringify(ALLOWLIST), 'utf8');

  const writeAudit = (name, content) => {
    const path = join(tmp, name);
    writeFileSync(path, content, 'utf8');
    return path;
  };

  it('exits 0 for a known-only report', () => {
    const path = writeAudit('ok.json', JSON.stringify(liveShapedReport()));
    const result = spawnSync(process.execPath, [SCRIPT, path, allowlistPath], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('списке известных');
  });

  it('exits 1 for an unknown advisory', () => {
    const audit = liveShapedReport();
    audit.vulnerabilities['left-pad'] = {
      name: 'left-pad',
      severity: 'high',
      via: [advisory('GHSA-9999-zzzz-0003', 'high')],
    };
    const path = writeAudit('new.json', JSON.stringify(report(audit.vulnerabilities)));
    const result = spawnSync(process.execPath, [SCRIPT, path, allowlistPath], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('проверка не пройдена');
  });

  it('exits 1 for corrupted JSON (fail-closed)', () => {
    const path = writeAudit('broken.json', '{ not json');
    const result = spawnSync(process.execPath, [SCRIPT, path, allowlistPath], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('не является корректным JSON');
  });

  it('exits 1 for an empty report file (fail-closed)', () => {
    const path = writeAudit('empty.json', '');
    const result = spawnSync(process.execPath, [SCRIPT, path, allowlistPath], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('пуст');
  });

  it('exits 1 when the audit file is missing (fail-closed)', () => {
    const result = spawnSync(process.execPath, [SCRIPT, join(tmp, 'nope.json'), allowlistPath], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('не удалось прочитать отчёт');
  });

  it('exits 2 without arguments', () => {
    expect(runCli(['node', SCRIPT])).toBe(2);
  });
});
