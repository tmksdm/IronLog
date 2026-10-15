// scripts/ci/check-audit.mjs
//
// CI helper: verifies the full `npm audit` report against an explicit list of
// known advisories.
//
// Fail-closed rules (any of these fails the check):
//   - the report is missing, empty, not JSON or structurally unexpected;
//   - npm itself reported an error payload ("error" key);
//   - metadata counters are missing, non-numeric or disagree with the package records;
//   - a package record has an unknown severity (never treated as "info");
//   - a `via` entry is neither a string nor an object with a URL
//     (nothing is skipped silently);
//   - a string `via` link points to a package absent from the report;
//   - an advisory is not in the known list, or became more severe than recorded.
//
// Two different entities are tracked and never conflated:
//   - vulnerable packages (keys of `vulnerabilities`, counted by metadata);
//   - advisories (objects inside `via`, one package may carry several).
//
// usage: node scripts/ci/check-audit.mjs <audit.json> <allowlist.json> [summary.md]

import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SEVERITY_RANK = Object.freeze({
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
});
const SEVERITY_LEVELS = ['critical', 'high', 'moderate', 'low', 'info'];

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Returns the severity rank, or null for any value that is not a known level. */
const rankOf = (severity) =>
  typeof severity === 'string' && Object.prototype.hasOwnProperty.call(SEVERITY_RANK, severity)
    ? SEVERITY_RANK[severity]
    : null;

/** Parses raw audit output. Returns { audit } or { error }. */
export function parseAuditReport(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { error: 'отчёт npm audit пуст (файл отсутствует или не записан)' };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { error: `отчёт npm audit не является корректным JSON (${error.message})` };
  }
  if (!isPlainObject(parsed)) {
    return { error: 'отчёт npm audit не является объектом' };
  }
  return { audit: parsed };
}

/**
 * Checks a parsed audit report against the allowlist.
 * Pure function: no I/O. Returns { ok, errors, warnings, stats, markdown }.
 */
export function checkAuditReport(audit, allowlist) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(audit)) {
    return failure(['отчёт npm audit не является объектом'], allowlist);
  }

  if (isPlainObject(audit.error)) {
    const code = audit.error.code ?? 'без кода';
    const message = audit.error.summary ?? audit.error.message ?? JSON.stringify(audit.error);
    return failure([`npm audit вернул ошибку (${code}): ${message}`], allowlist);
  }

  const meta = audit.metadata;
  if (!isPlainObject(meta) || !isPlainObject(meta.vulnerabilities)) {
    return failure(['отчёт не содержит metadata.vulnerabilities — формат неожиданный'], allowlist);
  }

  const metaCounts = meta.vulnerabilities;
  for (const level of SEVERITY_LEVELS) {
    if (typeof metaCounts[level] !== 'number' || !Number.isInteger(metaCounts[level])) {
      errors.push(`в metadata.vulnerabilities отсутствует целое число для «${level}»`);
    }
  }
  if (typeof metaCounts.total !== 'number' || !Number.isInteger(metaCounts.total)) {
    errors.push('в metadata.vulnerabilities отсутствует целое число total');
  }

  const vulns = audit.vulnerabilities;
  if (!isPlainObject(vulns)) {
    errors.push('отчёт не содержит раздел vulnerabilities — формат неожиданный');
    return failure(errors, allowlist);
  }

  // --- allowlist -----------------------------------------------------------
  const allowed = new Map();
  if (!Array.isArray(allowlist?.entries)) {
    errors.push('список известных уязвимостей не содержит массива entries');
  } else {
    for (const [index, entry] of allowlist.entries.entries()) {
      if (!isPlainObject(entry)) {
        errors.push(`запись списка №${index} не является объектом`);
        continue;
      }
      const { package: pkg, advisory, severity } = entry;
      if (typeof pkg !== 'string' || pkg.trim() === '') {
        errors.push(`в записи списка №${index} отсутствует имя пакета`);
        continue;
      }
      if (typeof advisory !== 'string' || advisory.trim() === '') {
        errors.push(`в записи списка для «${pkg}» отсутствует идентификатор advisory`);
        continue;
      }
      if (rankOf(severity) === null) {
        errors.push(`в записи списка для «${pkg}» неизвестная severity: ${JSON.stringify(severity)}`);
        continue;
      }
      const key = `${pkg}|${advisory}`;
      if (allowed.has(key)) {
        warnings.push(`дубликат в списке известных уязвимостей: ${pkg} / ${advisory}`);
      }
      allowed.set(key, entry);
    }
  }

  // --- vulnerable packages -------------------------------------------------
  const packages = [];
  const computed = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };

  for (const [name, record] of Object.entries(vulns)) {
    if (!isPlainObject(record)) {
      errors.push(`запись о пакете «${name}» не является объектом`);
      continue;
    }

    const severity = record.severity;
    if (rankOf(severity) === null) {
      // Never assume a default level: an unknown severity means an unexpected report.
      errors.push(`неизвестная severity у пакета «${name}»: ${JSON.stringify(severity)}`);
      continue;
    }
    computed[severity] += 1;
    computed.total += 1;

    if (!Array.isArray(record.via)) {
      errors.push(`у пакета «${name}» отсутствует массив via`);
      continue;
    }
    if (record.via.length === 0) {
      errors.push(`у пакета «${name}» пустой массив via`);
      continue;
    }

    // Repeated references to the same advisory are collapsed (the worst severity
    // wins), while the raw number of references is kept and reported.
    const advisoryById = new Map();
    const links = [];
    let advisoryReferences = 0;
    for (const via of record.via) {
      if (typeof via === 'string') {
        if (via.trim() === '') {
          errors.push(`у пакета «${name}» пустая строковая ссылка via`);
        } else {
          links.push(via);
        }
        continue;
      }
      if (isPlainObject(via)) {
        if (typeof via.url !== 'string' || via.url.trim() === '') {
          errors.push(`у пакета «${name}» найдена advisory-запись без url`);
          continue;
        }
        const advisory = via.url.split('/').filter(Boolean).pop() ?? '';
        if (advisory === '') {
          errors.push(`у пакета «${name}» не удалось определить идентификатор из url: ${via.url}`);
          continue;
        }
        const advisorySeverity = via.severity ?? severity;
        if (rankOf(advisorySeverity) === null) {
          errors.push(
            `неизвестная severity у advisory ${advisory} (пакет «${name}»): ${JSON.stringify(advisorySeverity)}`
          );
          continue;
        }
        advisoryReferences += 1;
        const previous = advisoryById.get(advisory);
        if (previous === undefined || rankOf(advisorySeverity) > rankOf(previous.severity)) {
          advisoryById.set(advisory, { advisory, url: via.url, severity: advisorySeverity });
        }
        continue;
      }
      errors.push(`неподдерживаемая запись via у пакета «${name}»: ${typeof via}`);
    }

    packages.push({
      name,
      severity,
      advisories: [...advisoryById.values()],
      advisoryReferences,
      links,
    });
  }

  // --- string links must resolve ------------------------------------------
  for (const pkg of packages) {
    for (const link of pkg.links) {
      if (!Object.prototype.hasOwnProperty.call(vulns, link)) {
        errors.push(
          `строка via «${link}» у пакета «${pkg.name}» не указывает на пакет из отчёта`
        );
      }
    }
  }

  // --- completeness: metadata counters vs package records -----------------
  for (const level of SEVERITY_LEVELS) {
    if (typeof metaCounts[level] === 'number' && metaCounts[level] !== computed[level]) {
      errors.push(
        `metadata.vulnerabilities.${level} = ${metaCounts[level]}, но в отчёте ${computed[level]} таких пакетов`
      );
    }
  }
  if (typeof metaCounts.total === 'number' && metaCounts.total !== computed.total) {
    errors.push(
      `metadata.vulnerabilities.total = ${metaCounts.total}, но в отчёте ${computed.total} записей о пакетах`
    );
  }

  // --- coverage of every reported package ---------------------------------
  const unknownAdvisories = [];
  const escalated = [];
  const allowedAdvisories = [];
  const transitivePackages = [];

  for (const pkg of packages) {
    const matched = pkg.advisories.filter((item) => allowed.has(`${pkg.name}|${item.advisory}`));

    for (const item of pkg.advisories) {
      const entry = allowed.get(`${pkg.name}|${item.advisory}`);
      if (!entry) {
        unknownAdvisories.push({ ...item, packageName: pkg.name });
        continue;
      }
      if (rankOf(item.severity) > rankOf(entry.severity)) {
        escalated.push({
          ...item,
          packageName: pkg.name,
          recorded: entry.severity,
        });
      } else {
        allowedAdvisories.push({ ...item, packageName: pkg.name });
      }
    }

    if (matched.length > 0) {
      continue;
    }
    if (pkg.advisories.length > 0) {
      continue; // already reported as an unknown advisory
    }
    if (pkg.links.length === 0) {
      errors.push(`пакет «${pkg.name}» не покрыт списком и не связан ни с одним пакетом`);
      continue;
    }

    // Link-only package: covered through another vulnerable package, but the
    // severity must not exceed the worst package it points at.
    const linked = pkg.links
      .map((link) => vulns[link])
      .filter(isPlainObject)
      .map((record) => rankOf(record.severity))
      .filter((rank) => rank !== null);
    const worstLinked = linked.length > 0 ? Math.max(...linked) : null;
    if (worstLinked === null) {
      errors.push(`пакет «${pkg.name}» связан только с пакетами без известной severity`);
      continue;
    }
    if (rankOf(pkg.severity) > worstLinked) {
      errors.push(
        `пакет «${pkg.name}» (${pkg.severity}) не покрыт списком и строже связанных с ним пакетов`
      );
      continue;
    }
    transitivePackages.push({ name: pkg.name, severity: pkg.severity, links: pkg.links });
  }

  // --- stale allowlist entries --------------------------------------------
  const seenKeys = new Set();
  for (const pkg of packages) {
    for (const item of pkg.advisories) seenKeys.add(`${pkg.name}|${item.advisory}`);
  }
  const stale = [...allowed.values()].filter(
    (entry) => !seenKeys.has(`${entry.package}|${entry.advisory}`)
  );

  const advisoryTotal = packages.reduce((sum, pkg) => sum + pkg.advisories.length, 0);
  const advisoryReferences = packages.reduce((sum, pkg) => sum + pkg.advisoryReferences, 0);
  const stats = {
    packages: computed.total,
    advisories: advisoryTotal,
    advisoryReferences,
    allowedAdvisories: allowedAdvisories.length,
    unknownAdvisories: unknownAdvisories.length,
    escalated: escalated.length,
    transitivePackages: transitivePackages.length,
    stale: stale.length,
    computedCounts: computed,
    metadataCounts: {
      info: metaCounts.info,
      low: metaCounts.low,
      moderate: metaCounts.moderate,
      high: metaCounts.high,
      critical: metaCounts.critical,
      total: metaCounts.total,
    },
  };

  const ok = errors.length === 0 && unknownAdvisories.length === 0 && escalated.length === 0;

  const markdown = renderMarkdown({
    ok,
    errors,
    warnings,
    stats,
    unknownAdvisories,
    escalated,
    allowedAdvisories,
    transitivePackages,
    stale,
    packages,
    allowlist,
  });

  return { ok, errors, warnings, stats, markdown };
}

function failure(errors, allowlist) {
  return {
    ok: false,
    errors,
    warnings: [],
    stats: null,
    markdown: renderMarkdown({
      ok: false,
      errors,
      warnings: [],
      stats: null,
      unknownAdvisories: [],
      escalated: [],
      allowedAdvisories: [],
      transitivePackages: [],
      stale: [],
      packages: [],
      allowlist,
    }),
  };
}

function renderMarkdown({
  ok,
  errors,
  warnings,
  stats,
  unknownAdvisories,
  escalated,
  allowedAdvisories,
  transitivePackages,
  stale,
  packages,
  allowlist,
}) {
  const lines = [];
  lines.push('## npm audit — полный отчёт');
  lines.push('');
  lines.push(
    ok
      ? 'Все найденные уязвимости перечислены в списке известных.'
      : '**Проверка не пройдена.**'
  );
  lines.push('');

  if (stats) {
    lines.push('| severity | уязвимых пакетов (посчитано из отчёта) | счётчик metadata |');
    lines.push('|---|---|---|');
    for (const level of SEVERITY_LEVELS) {
      lines.push(`| ${level} | ${stats.computedCounts[level]} | ${stats.metadataCounts[level]} |`);
    }
    lines.push(`| **всего пакетов** | **${stats.computedCounts.total}** | **${stats.metadataCounts.total}** |`);
    lines.push('');
    lines.push(
      `Это разные сущности: уязвимых пакетов — ${stats.packages}, уникальных advisory — ${stats.advisories} ` +
        `(ссылок на advisory в отчёте — ${stats.advisoryReferences}, повторы сведены с сохранением максимальной severity). ` +
        'Счётчики metadata сверяются с пакетами, не с advisory.'
    );
    lines.push('');
    lines.push(
      `Покрытие: advisory из списка — ${stats.allowedAdvisories}, ` +
        `неизвестных — ${stats.unknownAdvisories}, повышений severity — ${stats.escalated}, ` +
        `пакетов, покрытых транзитивно, — ${stats.transitivePackages}, ` +
        `устаревших записей в списке — ${stats.stale}.`
    );
    lines.push('');
  }

  if (errors.length > 0) {
    lines.push('### Ошибки формата и полноты отчёта');
    lines.push('');
    for (const error of errors) lines.push(`- ${error}`);
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push('### Предупреждения');
    lines.push('');
    for (const warning of warnings) lines.push(`- ${warning}`);
    lines.push('');
  }

  if (unknownAdvisories.length > 0) {
    lines.push('### Неизвестные уязвимости (нужно разобраться и внести в список)');
    lines.push('');
    for (const item of unknownAdvisories) {
      lines.push(`- \`${item.packageName}\` — ${item.severity} — ${item.advisory} (${item.url})`);
    }
    lines.push('');
  }

  if (escalated.length > 0) {
    lines.push('### Severity выросла относительно записи в списке');
    lines.push('');
    for (const item of escalated) {
      lines.push(
        `- \`${item.packageName}\` — ${item.recorded} → ${item.severity} — ${item.advisory}`
      );
    }
    lines.push('');
  }

  if (transitivePackages.length > 0) {
    lines.push('### Пакеты, покрытые транзитивно (через известную уязвимость)');
    lines.push('');
    for (const item of transitivePackages) {
      lines.push(`- \`${item.name}\` — ${item.severity} — через ${item.links.map((l) => `\`${l}\``).join(', ')}`);
    }
    lines.push('');
  }

  if (packages.length > 0) {
    lines.push('<details><summary>Все найденные уязвимости по пакетам</summary>');
    lines.push('');
    for (const pkg of packages) {
      const parts = [
        ...pkg.advisories.map((item) => {
          const entry = allowlist?.entries?.find(
            (e) => e.package === pkg.name && e.advisory === item.advisory
          );
          return `${item.advisory}${entry ? ' — известная' : ' — **новая**'}`;
        }),
        ...pkg.links.map((link) => `via \`${link}\` — транзитивная`),
      ];
      lines.push(`- \`${pkg.name}\` — ${pkg.severity} — ${parts.join('; ') || 'нет деталей'}`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  if (allowedAdvisories.length > 0) {
    lines.push(
      `Известные уязвимости закрываются в ${allowlist?.closeInStage ?? 'следующем этапе'} ` +
        `(запись от ${allowlist?.reviewedAt ?? 'без даты'}). Они не считаются устранёнными: ` +
        'жёсткий гейт выше проверяет только production-зависимости.'
    );
    lines.push('');
  }

  if (stale.length > 0) {
    lines.push('### Записи в списке, которых больше нет в отчёте (пора удалить)');
    lines.push('');
    for (const entry of stale) lines.push(`- \`${entry.package}\` — ${entry.advisory}`);
  }

  return lines.join('\n');
}

/** CLI entry point. Returns the process exit code. */
export function runCli(argv) {
  const [, , auditPath, allowlistPath, summaryPath] = argv;

  const write = (text) => {
    console.log(text);
    if (summaryPath) {
      try {
        appendFileSync(summaryPath, `${text}\n`);
      } catch (error) {
        console.error(`Не удалось записать summary: ${error.message}`);
      }
    }
  };

  if (!auditPath || !allowlistPath) {
    write('usage: check-audit.mjs <audit.json> <allowlist.json> [summary.md]');
    return 2;
  }

  let auditText;
  try {
    auditText = readFileSync(auditPath, 'utf8');
  } catch (error) {
    write('## npm audit — полный отчёт');
    write('');
    write('**Проверка не пройдена (fail-closed).**');
    write('');
    write(`- не удалось прочитать отчёт npm audit «${auditPath}»: ${error.message}`);
    return 1;
  }

  let allowlist;
  try {
    allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
  } catch (error) {
    write('## npm audit — полный отчёт');
    write('');
    write('**Проверка не пройдена (fail-closed).**');
    write('');
    write(`- не удалось прочитать список известных уязвимостей «${allowlistPath}»: ${error.message}`);
    return 1;
  }

  const parsed = parseAuditReport(auditText);
  const result = parsed.error
    ? failure([parsed.error], allowlist)
    : checkAuditReport(parsed.audit, allowlist);

  write(result.markdown);

  if (!result.ok) {
    const unknown = result.stats?.unknownAdvisories ?? 0;
    const escalated = result.stats?.escalated ?? 0;
    console.error(
      `npm audit: проверка не пройдена (неизвестных advisory: ${unknown}, повышений severity: ${escalated}, ` +
        `ошибок формата: ${result.errors.length}). Разберитесь и внесите запись в ` +
        'scripts/ci/known-audit-advisories.json осознанно.'
    );
    return 1;
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
