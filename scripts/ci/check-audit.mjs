// scripts/ci/check-audit.mjs
//
// CI helper: verifies the full `npm audit` report against an explicit list of
// known advisories. The check FAILS (fail-closed) when:
//   - the audit report cannot be read (registry unavailable) — never silently pass;
//   - an advisory outside the list is found;
//   - a listed advisory becomes more severe than recorded.
// Known entries are reported in the job summary but are NOT presented as fixed.
//
// usage: node scripts/ci/check-audit.mjs <audit.json> <allowlist.json> [summary.md]

import { readFileSync, appendFileSync } from 'node:fs';

const [, , auditPath, allowlistPath, summaryPath] = process.argv;

if (!auditPath || !allowlistPath) {
  console.error('usage: check-audit.mjs <audit.json> <allowlist.json> [summary.md]');
  process.exit(2);
}

const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { __error: `${label}: ${error.message}` };
  }
}

function write(line) {
  console.log(line);
  if (summaryPath) appendFileSync(summaryPath, `${line}\n`);
}

const audit = readJson(auditPath, 'не удалось прочитать отчёт npm audit');
const allow = readJson(allowlistPath, 'не удалось прочитать список известных уязвимостей');

if (audit.__error || allow.__error || !audit.metadata) {
  write('## npm audit — полный отчёт');
  write('');
  write(`**Проверка не пройдена.** ${audit.__error ?? allow.__error ?? 'отчёт npm audit пуст или неполон'}.`);
  write('');
  write('Отчёт считается недостоверным, поэтому проверка завершается ошибкой (fail-closed).');
  process.exit(1);
}

const counts = audit.metadata.vulnerabilities ?? {};
const allowed = new Map(
  (allow.entries ?? []).map((entry) => [`${entry.package}|${entry.advisory}`, entry])
);

// Unique (package, advisory, severity) triples, severity taken as the worst seen.
const found = new Map();
for (const [pkg, vuln] of Object.entries(audit.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== 'object' || !via.url) continue;
    const advisory = String(via.url).split('/').pop();
    const key = `${pkg}|${advisory}`;
    const severity = String(via.severity ?? vuln.severity ?? 'unknown');
    const previous = found.get(key);
    if (!previous || SEVERITY_RANK[severity] > SEVERITY_RANK[previous.severity]) {
      found.set(key, { pkg, advisory, severity });
    }
  }
}

const unknown = [];
const escalated = [];
for (const [key, item] of found) {
  const entry = allowed.get(key);
  if (!entry) {
    unknown.push(item);
    continue;
  }
  if ((SEVERITY_RANK[item.severity] ?? 0) > (SEVERITY_RANK[entry.severity] ?? 0)) {
    escalated.push({ ...item, recorded: entry.severity });
  }
}
const stale = [...allowed.values()].filter(
  (entry) => !found.has(`${entry.package}|${entry.advisory}`)
);

const failed = unknown.length > 0 || escalated.length > 0;

write('## npm audit — полный отчёт');
write('');
if (failed) {
  write('**Проверка не пройдена.**');
} else {
  write('Все найденные уязвимости перечислены в списке известных.');
}
write('');
write('| severity | количество |');
write('|---|---|');
for (const level of ['critical', 'high', 'moderate', 'low', 'info']) {
  write(`| ${level} | ${counts[level] ?? 0} |`);
}
write(`| **всего** | **${counts.total ?? 0}** |`);
write('');
write(
  `Найдено уникальных пар «пакет + advisory»: ${found.size}. ` +
    `Из списка известных: ${found.size - unknown.length - escalated.length}. ` +
    `Неизвестных: ${unknown.length}. Повышение severity: ${escalated.length}.`
);
write('');

if (unknown.length > 0) {
  write('### Неизвестные уязвимости (нужно разобраться и внести в список)');
  write('');
  for (const item of unknown) {
    write(`- \`${item.pkg}\` — ${item.severity} — ${item.advisory}`);
  }
  write('');
}

if (escalated.length > 0) {
  write('### Severity выросла относительно записи в списке');
  write('');
  for (const item of escalated) {
    write(`- \`${item.pkg}\` — ${item.recorded} → ${item.severity} — ${item.advisory}`);
  }
  write('');
}

if (found.size > 0) {
  write('<details><summary>Все найденные уязвимости</summary>');
  write('');
  for (const item of found.values()) {
    const entry = allowed.get(`${item.pkg}|${item.advisory}`);
    write(
      `- \`${item.pkg}\` — ${item.severity} — ${item.advisory}` +
        (entry ? ' — известная' : ' — **новая**')
    );
  }
  write('');
  write('</details>');
  write('');
}

write(
  `Известные уязвимости закрываются в ${allow.closeInStage ?? 'следующем этапе'} ` +
    `(запись от ${allow.reviewedAt ?? 'без даты'}). Они не считаются устранёнными: ` +
    'жёсткий гейт выше проверяет только production-зависимости.'
);

if (stale.length > 0) {
  write('');
  write('### Записи в списке, которых больше нет в отчёте (пора удалить)');
  write('');
  for (const entry of stale) {
    write(`- \`${entry.package}\` — ${entry.advisory}`);
  }
}

if (failed) {
  console.error(
    `npm audit: неизвестных уязвимостей ${unknown.length}, повышений severity ${escalated.length}. ` +
      'Разберитесь и внесите запись в scripts/ci/known-audit-advisories.json осознанно.'
  );
  process.exit(1);
}
