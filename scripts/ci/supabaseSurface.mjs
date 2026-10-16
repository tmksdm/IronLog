// scripts/ci/supabaseSurface.mjs
//
// Static check of the Supabase surface the application actually uses.
//
// Why this exists: `npm run build:test` replaces the real client with a stub
// (see vite.config.ts, TEST_BUILD_MODULE_STUBS). The stub is a narrow object, so
// a new call such as `supabase.auth.getUser()` would compile against the real
// modules and only fail at runtime in the test build. Types cannot cover it:
// the stub's `from` returns `never`, which is assignable to everything.
//
// The check resolves every member access on the client through the TypeScript
// symbol/type checker — not through text — and compares the path against the
// stub's own type. Whatever the analyzer cannot resolve (destructuring the
// client, passing it around, dynamic keys) is reported as a violation instead of
// being skipped: the check fails closed.
//
// The list of substituted modules is read from vite.config.ts itself, so the
// exemption list cannot drift from the build configuration.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG_FILE = 'tsconfig.json';
const VITE_CONFIG_FILE = 'vite.config.ts';
const SUBSTITUTIONS_NAME = 'TEST_BUILD_MODULE_STUBS';

/**
 * The compile-time contract also imports the client by value. It is verification
 * evidence rather than application code, so it is out of scope here.
 */
const CONTRACT_FILE = 'src/lib/cloudStubContract.ts';

const CLIENT_MODULE_FILE = 'src/lib/supabase.ts';
const CLIENT_EXPORT_NAME = 'supabase';

function normalize(filePath) {
  return filePath.replaceAll('\\', '/');
}

/**
 * Reads the module substitution map out of vite.config.ts. Structural parse, no
 * pattern matching over the file text: an unreadable or empty map is an error,
 * never an empty exemption list.
 */
export function parseSubstitutedModules(sourceText, fileName = VITE_CONFIG_FILE) {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );

  let initializer = null;
  const findDeclaration = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === SUBSTITUTIONS_NAME &&
      node.initializer
    ) {
      initializer = node.initializer;
      return;
    }
    ts.forEachChild(node, findDeclaration);
  };
  findDeclaration(source);

  if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
    throw new Error(
      `не удалось прочитать ${SUBSTITUTIONS_NAME} из ${fileName}: ` +
        'проверка используемой поверхности Supabase не может быть выполнена'
    );
  }

  const entries = initializer.elements.map((element) => {
    if (!ts.isArrayLiteralExpression(element) || element.elements.length !== 2) {
      throw new Error(
        `${SUBSTITUTIONS_NAME} в ${fileName} должен состоять из пар ` +
          '[production-модуль, заглушка]'
      );
    }
    const parts = element.elements.map((part) =>
      ts.isStringLiteral(part) ? part.text : null
    );
    if (parts.some((part) => part === null)) {
      throw new Error(
        `${SUBSTITUTIONS_NAME} в ${fileName} должен содержать только строковые пути`
      );
    }
    return { original: normalize(parts[0]), stub: normalize(parts[1]) };
  });

  if (entries.length === 0) {
    throw new Error(`список ${SUBSTITUTIONS_NAME} пуст: подмена модулей не настроена`);
  }

  return entries;
}

/** The substitution map as the build configuration currently defines it. */
export function readSubstitutedModules(repoRoot = REPO_ROOT) {
  const configPath = resolve(repoRoot, VITE_CONFIG_FILE);
  return parseSubstitutedModules(readFileSync(configPath, 'utf-8'), VITE_CONFIG_FILE);
}

/** Compiler options and root files exactly as the standard build sees them. */
export function loadProject(repoRoot = REPO_ROOT) {
  const configPath = resolve(repoRoot, CONFIG_FILE);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      `не удалось прочитать ${CONFIG_FILE}: ${ts.flattenDiagnosticMessageText(
        config.error.messageText,
        ' '
      )}`
    );
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, repoRoot);
  return { options: parsed.options, fileNames: parsed.fileNames };
}

function findExportedSymbol(checker, sourceFile, name) {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return undefined;
  const exported = checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === name);
  if (!exported) return undefined;
  return exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
}

function declarationOf(symbol) {
  return symbol.valueDeclaration ?? symbol.declarations?.[0];
}

function typeOfSymbol(checker, symbol) {
  const declaration = declarationOf(symbol);
  return declaration ? checker.getTypeAtLocation(declaration) : undefined;
}

/**
 * Analyzes a program. Exported separately so tests can run it over a synthetic
 * in-memory program without touching the real sources.
 */
export function analyzeProgram({
  program,
  clientModuleFile,
  stubModuleFile,
  exemptModuleFiles = [],
  rootDir,
}) {
  const checker = program.getTypeChecker();
  const clientFile = program.getSourceFile(clientModuleFile);
  const stubFile = program.getSourceFile(stubModuleFile);
  if (!clientFile || !stubFile) {
    throw new Error(
      `не найдены модули для анализа: ${clientModuleFile} / ${stubModuleFile}`
    );
  }

  const clientSymbol = findExportedSymbol(checker, clientFile, CLIENT_EXPORT_NAME);
  const stubSymbol = findExportedSymbol(checker, stubFile, CLIENT_EXPORT_NAME);
  if (!clientSymbol || !stubSymbol) {
    throw new Error(`модули не экспортируют «${CLIENT_EXPORT_NAME}»: анализ невозможен`);
  }

  const clientType = typeOfSymbol(checker, clientSymbol);
  const stubClientType = typeOfSymbol(checker, stubSymbol);
  if (!stubClientType) {
    throw new Error('не удалось получить тип заглушки клиента: анализ невозможен');
  }

  const exempt = new Set([normalize(clientModuleFile), normalize(stubModuleFile)]);
  for (const file of exemptModuleFiles) exempt.add(normalize(file));
  const normalizedRoot = `${normalize(rootDir).replace(/\/$/, '')}/`;

  const violations = [];
  const chains = [];
  const stats = { filesAnalyzed: 0, chainsAnalyzed: 0, segmentsChecked: 0 };

  const report = (sourceFile, node, kind, message) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    violations.push({
      file: normalize(sourceFile.fileName),
      line: line + 1,
      column: character + 1,
      kind,
      message,
    });
  };

  /** True when the expression refers to the production client (aliases included). */
  const isClientExpression = (node) => {
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
      const parent = node.parent;
      if (ts.isImportSpecifier(parent) || ts.isImportClause(parent)) return false;
      if (ts.isExportSpecifier(parent) || ts.isNamespaceImport(parent)) return false;
      if (ts.isNamespaceExport(parent) || ts.isQualifiedName(parent)) return false;
      // The `.name` half of `ns.supabase` is a property, not a reference.
      if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
    }

    const symbol = checker.getSymbolAtLocation(node);
    if (symbol) {
      const target =
        symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      if (target === clientSymbol) return true;
      const targetDeclaration = declarationOf(target);
      if (targetDeclaration && targetDeclaration === declarationOf(clientSymbol)) return true;
    }

    if (clientType === undefined) return false;
    return checker.getTypeAtLocation(node) === clientType;
  };

  const isWrapper = (node) =>
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isAsExpression(node);

  const isCandidateExpression = (node) =>
    ts.isIdentifier(node) ||
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node) ||
    isWrapper(node);

  const isMemberAccess = (node) =>
    ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node);

  /** Member name of one link of a chain, or null when it cannot be resolved. */
  const segmentName = (node) => {
    if (ts.isPropertyAccessExpression(node)) return node.name.text;
    if (ts.isElementAccessExpression(node)) {
      const argument = node.argumentExpression;
      if (argument && (ts.isStringLiteral(argument) || ts.isNumericLiteral(argument))) {
        return argument.text;
      }
    }
    return null;
  };

  /** The property type, or nothing when the stub does not expose that member. */
  const stubMember = (type, name) => {
    const property = type.getProperty(name);
    if (!property) return null;
    const location = declarationOf(property) ?? stubFile;
    return { property, type: checker.getTypeOfSymbolAtLocation(property, location) };
  };

  const returnsNever = (memberType) => {
    const signature = memberType.getCallSignatures()[0];
    if (!signature) return false;
    return (signature.getReturnType().flags & ts.TypeFlags.Never) !== 0;
  };

  /** Collects the member path that follows a client expression and checks it. */
  const collectChain = (base) => {
    const segments = [];
    let unresolved = false;
    let current = base;
    for (;;) {
      const parent = current.parent;
      if (!isMemberAccess(parent) || parent.expression !== current) break;
      const name = segmentName(parent);
      if (name === null) unresolved = true;
      else segments.push(name);
      current = parent;
    }

    const sourceFile = base.getSourceFile();
    stats.chainsAnalyzed += 1;
    stats.segmentsChecked += segments.length;
    chains.push({ path: segments.join('.'), file: normalize(sourceFile.fileName) });

    if (unresolved) {
      report(
        sourceFile,
        base,
        'unanalyzable-form',
        `обращение к «${segments.join('.')}» использует вычисляемый ключ: ` +
          'анализатор не может сверить его с заглушкой'
      );
      return;
    }

    let type = stubClientType;
    const walked = [];
    for (const segment of segments) {
      const member = stubMember(type, segment);
      const currentPath = [...walked, segment].join('.');
      if (!member) {
        report(
          sourceFile,
          base,
          'unsupported-member',
          `«${currentPath}» отсутствует в тестовой заглушке: тестовая сборка упадёт в рантайме`
        );
        return;
      }
      if (returnsNever(member.type)) {
        report(
          sourceFile,
          base,
          'fail-closed-member',
          `«${currentPath}» намеренно падает в тестовой сборке и не может вызываться ` +
            'вне подменяемых модулей'
        );
        return;
      }
      walked.push(segment);
      type = member.type;
    }
  };

  const visit = (node, sourceFile) => {
    if (isCandidateExpression(node)) {
      // A wrapper is reported once, at its outermost node.
      const wrapped = isWrapper(node.parent) && node.parent.expression === node;
      if (!wrapped && isClientExpression(node)) {
        let base = node;
        for (;;) {
          const parent = base.parent;
          if (isWrapper(parent) && parent.expression === base) {
            base = parent;
            continue;
          }
          break;
        }

        const parent = base.parent;
        if (isMemberAccess(parent) && parent.expression === base) {
          collectChain(base);
        } else {
          report(
            sourceFile,
            base,
            'unanalyzable-form',
            'клиент Supabase используется как значение: анализатор не может проверить ' +
              'обращения через него по заглушке'
          );
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, sourceFile));
  };

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    const file = normalize(sourceFile.fileName);
    if (!file.startsWith(normalizedRoot)) continue;
    if (exempt.has(file)) continue;
    stats.filesAnalyzed += 1;
    visit(sourceFile, sourceFile);
  }

  return { violations, chains, stats, exempt: [...exempt].sort() };
}

/** Runs the check over the real project. */
export function analyzeSurface({ repoRoot = REPO_ROOT } = {}) {
  const substitutions = readSubstitutedModules(repoRoot);
  const client = substitutions.find((entry) => normalize(entry.original).endsWith(CLIENT_MODULE_FILE));
  if (!client) {
    throw new Error(
      `в ${VITE_CONFIG_FILE} нет подмены для ${CLIENT_MODULE_FILE}: ` +
        'проверка используемой поверхности Supabase не может быть выполнена'
    );
  }

  const { options, fileNames } = loadProject(repoRoot);
  const program = ts.createProgram(fileNames, options);

  return analyzeProgram({
    program,
    clientModuleFile: resolve(repoRoot, client.original),
    stubModuleFile: resolve(repoRoot, client.stub),
    exemptModuleFiles: [
      ...substitutions.flatMap((entry) => [
        resolve(repoRoot, entry.original),
        resolve(repoRoot, entry.stub),
      ]),
      resolve(repoRoot, CONTRACT_FILE),
    ],
    rootDir: repoRoot,
  });
}

function formatViolation(violation, repoRoot) {
  const file = violation.file.startsWith(normalize(repoRoot))
    ? violation.file.slice(normalize(repoRoot).length + 1)
    : violation.file;
  return `  ${file}:${violation.line}:${violation.column} [${violation.kind}] ${violation.message}`;
}

export function runCli(
  argv,
  { repoRoot = REPO_ROOT, log = console.log, analyze = analyzeSurface } = {}
) {
  if (argv.includes('--help')) {
    log('usage: node scripts/ci/supabaseSurface.mjs [--list]');
    return 0;
  }

  const result = analyze({ repoRoot });

  if (argv.includes('--list')) {
    for (const chain of result.chains) {
      log(`${chain.path} — ${chain.file}`);
    }
  }

  if (result.violations.length > 0) {
    log(`❌ обращения к Supabase, не поддержанные тестовой заглушкой: ${result.violations.length}`);
    for (const violation of result.violations) log(formatViolation(violation, repoRoot));
    return 1;
  }

  // A check that suddenly sees no cloud access at all is not a healthy check.
  if (result.stats.chainsAnalyzed === 0) {
    log(
      '❌ анализатор не нашёл ни одного обращения к клиенту Supabase: ' +
        'проверка выродилась и не может ничего подтвердить'
    );
    return 1;
  }

  log(
    `✅ поверхность Supabase соответствует заглушке: ` +
      `${result.stats.chainsAnalyzed} обращений, ${result.stats.segmentsChecked} сегментов, ` +
      `${result.stats.filesAnalyzed} файлов`
  );
  return 0;
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  process.argv[1] !== '' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  }
}
