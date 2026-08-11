import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  matchesGlob,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { Plugin } from "vite";

export const ANALYTICS_CLIENT_BOUNDARY_ERROR =
  "analytics-server-module-forbidden-in-client-build";

const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"];

function toPosix(value: string): string {
  return value.replaceAll("\\", "/");
}

function withoutQuery(value: string): string {
  const clean = value.startsWith("\0") ? value.slice(1) : value;
  const queryIndex = clean.search(/[?#]/);
  return queryIndex === -1 ? clean : clean.slice(0, queryIndex);
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isSourceFile(path: string): boolean {
  return sourceExtensions.includes(extname(path).toLowerCase());
}

function isInsideRoot(path: string, root: string): boolean {
  const child = relative(root, path);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

export function isAnalyticsServerModule(pathOrId: string, root: string): boolean {
  let clean = decodePath(withoutQuery(pathOrId));
  if (clean.startsWith("/@fs/")) clean = clean.slice(4);
  if (clean.startsWith("file:")) {
    try {
      clean = fileURLToPath(clean);
    } catch {
      return false;
    }
  }

  const normalized = toPosix(
    isAbsolute(clean) ? relative(root, clean) : clean.replace(/^\/?@\//, ""),
  ).replace(/^\.\//, "");

  return (
    /^lib\/analytics\/server(?:-[^/]*)?\.[cm]?[jt]sx?$/.test(normalized) ||
    /^lib\/analytics\/server\//.test(normalized)
  );
}

function resolveLocalSpecifier(
  importer: string,
  specifier: string,
  root: string,
): string | null {
  const clean = decodePath(withoutQuery(specifier));
  let unresolved: string;

  if (clean.startsWith("/@fs/")) {
    unresolved = clean.slice(4);
  } else if (clean.startsWith("file:")) {
    try {
      unresolved = fileURLToPath(clean);
    } catch {
      return null;
    }
  } else if (clean.startsWith("@/")) {
    unresolved = resolve(root, clean.slice(2));
  } else if (clean.startsWith("/")) {
    unresolved = resolve(root, `.${clean}`);
  } else if (clean.startsWith(".")) {
    unresolved = resolve(dirname(withoutQuery(importer)), clean);
  } else if (isAbsolute(clean)) {
    unresolved = clean;
  } else {
    return null;
  }

  const candidates = isSourceFile(unresolved)
    ? [unresolved]
    : [
        unresolved,
        ...sourceExtensions.map((extension) => unresolved + extension),
        ...sourceExtensions.map((extension) =>
          join(unresolved, `index${extension}`),
        ),
      ];
  return candidates.find((candidate) => existsSync(candidate)) ?? unresolved;
}

function collectConstants(sourceFile: ts.SourceFile): Map<string, string> {
  const constants = new Map<string, string>();
  const declarations: Array<{ name: string; initializer: ts.Expression }> = [];

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      declarations.push({ name: node.name.text, initializer: node.initializer });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  for (let pass = 0; pass < declarations.length; pass += 1) {
    let changed = false;
    for (const declaration of declarations) {
      if (constants.has(declaration.name)) continue;
      const value = evaluateStaticString(declaration.initializer, constants);
      if (value !== null) {
        constants.set(declaration.name, value);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return constants;
}

function evaluateStaticString(
  node: ts.Expression | undefined,
  constants: ReadonlyMap<string, string>,
): string | null {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isIdentifier(node)) return constants.get(node.text) ?? null;
  if (ts.isParenthesizedExpression(node)) {
    return evaluateStaticString(node.expression, constants);
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = evaluateStaticString(node.left, constants);
    const right = evaluateStaticString(node.right, constants);
    return left === null || right === null ? null : left + right;
  }
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      const expression = evaluateStaticString(span.expression, constants);
      if (expression === null) return null;
      value += expression + span.literal.text;
    }
    return value;
  }
  return null;
}

function evaluateDynamicPattern(
  node: ts.Expression | undefined,
  constants: ReadonlyMap<string, string>,
): string | null {
  const exact = evaluateStaticString(node, constants);
  if (exact !== null) return exact;
  if (!node) return null;
  if (ts.isParenthesizedExpression(node)) {
    return evaluateDynamicPattern(node.expression, constants);
  }
  if (ts.isTemplateExpression(node)) {
    return `${node.head.text}${node.templateSpans
      .map((span) => `*${span.literal.text}`)
      .join("")}`;
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = evaluateDynamicPattern(node.left, constants);
    const right = evaluateDynamicPattern(node.right, constants);
    return left === null || right === null ? null : left + right;
  }
  return ts.isIdentifier(node) ? constants.get(node.text) ?? "*" : null;
}

function forbiddenServerFiles(root: string): string[] {
  const analyticsRoot = join(root, "lib", "analytics");
  if (!existsSync(analyticsRoot)) return [];

  function walk(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    });
  }

  return walk(analyticsRoot).filter((path) =>
    isAnalyticsServerModule(path, root),
  );
}

function patternIncludesForbiddenServer(
  pattern: string,
  importer: string,
  root: string,
): boolean {
  if (pattern.startsWith("!")) return false;
  const exactTarget = resolveLocalSpecifier(importer, pattern, root);
  if (exactTarget !== null && isAnalyticsServerModule(exactTarget, root)) {
    return true;
  }
  if (!/[?*{}[\]]/.test(pattern)) {
    return false;
  }

  const absolutePattern = pattern.startsWith("@/")
    ? toPosix(resolve(root, pattern.slice(2)))
    : pattern.startsWith("/")
      ? toPosix(resolve(root, `.${pattern}`))
      : toPosix(resolve(dirname(withoutQuery(importer)), pattern));

  return forbiddenServerFiles(root).some((candidate) =>
    matchesGlob(toPosix(candidate), absolutePattern),
  );
}

function importMetaGlobName(node: ts.Expression): string | null {
  if (!ts.isPropertyAccessExpression(node)) return null;
  if (node.name.text !== "glob" && node.name.text !== "globEager") return null;
  const owner = node.expression;
  return ts.isMetaProperty(owner) &&
    owner.keywordToken === ts.SyntaxKind.ImportKeyword &&
    owner.name.text === "meta"
    ? node.name.text
    : null;
}

function globPatterns(
  node: ts.Expression | undefined,
  constants: ReadonlyMap<string, string>,
): string[] {
  if (!node) return [];
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) =>
      ts.isSpreadElement(element)
        ? []
        : globPatterns(element as ts.Expression, constants),
    );
  }
  const value = evaluateStaticString(node, constants);
  return value === null ? [] : [value];
}

export type ClientBoundaryViolation = {
  readonly importer: string;
  readonly specifier: string;
  readonly kind:
    | "module"
    | "dynamic-import"
    | "import-meta-glob"
    | "new-url";
};

function isImportMetaUrl(node: ts.Expression | undefined): boolean {
  return Boolean(
    node &&
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "url" &&
      ts.isMetaProperty(node.expression) &&
      node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
      node.expression.name.text === "meta",
  );
}

export function findAnalyticsClientBoundaryViolations(
  code: string,
  importer: string,
  root: string,
): ClientBoundaryViolation[] {
  const sourceFile = ts.createSourceFile(
    importer,
    code,
    ts.ScriptTarget.Latest,
    true,
    importer.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const constants = collectConstants(sourceFile);
  const violations: ClientBoundaryViolation[] = [];

  function record(
    specifier: string,
    kind: ClientBoundaryViolation["kind"],
  ): void {
    if (patternIncludesForbiddenServer(specifier, importer, root)) {
      violations.push({ importer, specifier, kind });
    }
  }

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      const specifier = evaluateStaticString(node.moduleSpecifier, constants);
      if (specifier !== null) record(specifier, "module");
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const pattern = evaluateDynamicPattern(node.arguments[0], constants);
        if (pattern !== null) record(pattern, "dynamic-import");
      } else if (importMetaGlobName(node.expression)) {
        for (const pattern of globPatterns(node.arguments[0], constants)) {
          record(pattern, "import-meta-glob");
        }
      }
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "URL" &&
      isImportMetaUrl(node.arguments?.[1])
    ) {
      const pattern = evaluateDynamicPattern(node.arguments?.[0], constants);
      if (pattern !== null) record(pattern, "new-url");
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return violations;
}

function formatViolation(violation: ClientBoundaryViolation, root: string): string {
  return `${ANALYTICS_CLIENT_BOUNDARY_ERROR}: ${toPosix(
    relative(root, withoutQuery(violation.importer)),
  )} ${violation.kind} ${JSON.stringify(violation.specifier)}`;
}

export function analyticsServerBoundaryPlugin(projectRoot?: string): Plugin {
  let root = resolve(projectRoot ?? process.cwd());

  return {
    name: "aj-analytics-client-server-boundary",
    enforce: "pre",
    apply: "build",
    configResolved(config) {
      root = resolve(projectRoot ?? config.root);
    },
    applyToEnvironment(environment) {
      return (
        environment.name === "client" ||
        environment.config?.consumer === "client"
      );
    },
    resolveId(source, importer) {
      if (!importer) return null;
      const target = resolveLocalSpecifier(importer, source, root);
      if (
        isAnalyticsServerModule(source, root) ||
        (target !== null && isAnalyticsServerModule(target, root))
      ) {
        this.error(
          formatViolation(
            { importer, specifier: source, kind: "module" },
            root,
          ),
        );
      }
      return null;
    },
    load(id) {
      if (isAnalyticsServerModule(id, root)) {
        this.error(
          formatViolation(
            { importer: id, specifier: id, kind: "module" },
            root,
          ),
        );
      }
      return null;
    },
    transform(code, id) {
      const cleanId = withoutQuery(id);
      if (
        id.startsWith("\0") ||
        !isInsideRoot(cleanId, root) ||
        cleanId.includes("/node_modules/") ||
        !isSourceFile(cleanId)
      ) {
        return null;
      }
      const violation = findAnalyticsClientBoundaryViolations(
        code,
        cleanId,
        root,
      )[0];
      if (violation) this.error(formatViolation(violation, root));
      return null;
    },
  };
}

function hasUseClientDirective(sourceFile: ts.SourceFile): boolean {
  return sourceFile.statements.some(
    (statement) =>
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression) &&
      statement.expression.text === "use client",
  );
}

function projectSourceFiles(root: string): string[] {
  function walk(directory: string): string[] {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      return isSourceFile(path) ? [path] : [];
    });
  }
  return [join(root, "app"), join(root, "lib")].flatMap(walk);
}

function localDependencies(code: string, importer: string, root: string): string[] {
  const sourceFile = ts.createSourceFile(
    importer,
    code,
    ts.ScriptTarget.Latest,
    true,
    importer.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const constants = collectConstants(sourceFile);
  const dependencies: string[] = [];

  function add(expression: ts.Expression | undefined): void {
    const specifier = evaluateStaticString(expression, constants);
    if (specifier === null) return;
    const target = resolveLocalSpecifier(importer, specifier, root);
    if (target && existsSync(target) && statSync(target).isFile()) {
      dependencies.push(target);
    }
  }

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      add(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return dependencies;
}

export function assertAnalyticsClientBoundary(projectRoot: string): {
  readonly roots: number;
  readonly modules: number;
} {
  const root = resolve(projectRoot);
  const allSources = projectSourceFiles(root);
  const browserRoots = allSources.filter((path) => {
    const sourceFile = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      false,
    );
    return hasUseClientDirective(sourceFile);
  });
  const analyticsIndex = join(root, "lib", "analytics", "index.ts");
  if (existsSync(analyticsIndex)) browserRoots.push(analyticsIndex);

  const visited = new Set<string>();
  const pending = [...new Set(browserRoots.map((path) => resolve(path)))];
  while (pending.length > 0) {
    const path = pending.pop()!;
    if (visited.has(path)) continue;
    visited.add(path);
    if (isAnalyticsServerModule(path, root)) {
      throw new Error(
        `${ANALYTICS_CLIENT_BOUNDARY_ERROR}: browser graph reached ${toPosix(
          relative(root, path),
        )}`,
      );
    }

    const code = readFileSync(path, "utf8");
    const violation = findAnalyticsClientBoundaryViolations(code, path, root)[0];
    if (violation) throw new Error(formatViolation(violation, root));
    for (const dependency of localDependencies(code, path, root)) {
      if (!visited.has(dependency)) pending.push(dependency);
    }
  }

  return { roots: new Set(browserRoots).size, modules: visited.size };
}
