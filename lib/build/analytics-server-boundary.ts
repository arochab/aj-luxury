import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { Plugin } from "vite";

export const ANALYTICS_CLIENT_BOUNDARY_ERROR =
  "analytics-server-module-forbidden-in-client-build";
export const ANALYTICS_SERVER_ARTIFACT_MARKERS = [
  "order_paid",
  "canonical_commerce_d1_not_integrated",
  "storeOnce",
] as const;

const serverModulePattern =
  /^(?:lib\/analytics\/server(?:-[^/]*)?\.[cm]?[jt]sx?|lib\/analytics\/server\/)/;
const serverPatternSamples = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]
  .flatMap((extension) => [
    `lib/analytics/server${extension}`,
    `lib/analytics/server-entry${extension}`,
  ])
  .concat("lib/analytics/server/entry.ts");

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

function projectPath(id: string, root: string): string | null {
  let value = decodePath(withoutQuery(id));
  if (value.startsWith("/@fs/")) value = value.slice(4);
  if (value.startsWith("file:")) {
    try {
      value = fileURLToPath(value);
    } catch {
      return null;
    }
  }

  if (isAbsolute(value)) {
    const child = relative(root, value);
    if (child === ".." || child.startsWith("../") || isAbsolute(child)) {
      return null;
    }
    value = child;
  } else {
    value = value.replace(/^\/?@\//, "");
    while (value.startsWith("../")) value = value.slice(3);
    value = value.replace(/^\.\//, "");
  }
  return value.replaceAll("\\", "/").toLowerCase();
}

export function isAnalyticsServerModule(id: string, root: string): boolean {
  const normalized = projectPath(id, resolve(root));
  return normalized !== null && serverModulePattern.test(normalized);
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

function collectConstBindings(sourceFile: ts.SourceFile): Map<string, ts.Expression> {
  const bindings = new Map<string, ts.Expression>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      bindings.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bindings;
}

function resolveConst(
  node: ts.Expression,
  bindings: ReadonlyMap<string, ts.Expression>,
): ts.Expression {
  const seen = new Set<string>();
  node = unwrapExpression(node);
  while (ts.isIdentifier(node) && bindings.has(node.text)) {
    if (seen.has(node.text)) break;
    seen.add(node.text);
    node = unwrapExpression(bindings.get(node.text)!);
  }
  return node;
}

function computedPattern(
  node: ts.Expression | undefined,
  bindings: ReadonlyMap<string, ts.Expression>,
): string | null {
  if (!node) return null;
  node = resolveConst(node, bindings);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return `${node.head.text}${node.templateSpans
      .map(
        (span) =>
          `${computedPattern(span.expression, bindings) ?? "*"}${span.literal.text}`,
      )
      .join("")}`;
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = computedPattern(node.left, bindings);
    const right = computedPattern(node.right, bindings);
    return left === null || right === null ? null : left + right;
  }
  return "*";
}

function patternCanReachServer(pattern: string): boolean {
  let normalized = withoutQuery(pattern).replaceAll("\\", "/").toLowerCase();
  const libIndex = normalized.lastIndexOf("lib/");
  if (libIndex !== -1) normalized = normalized.slice(libIndex);
  if (!normalized.includes("*")) return serverModulePattern.test(normalized);

  const expression = normalized
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", "[^/]*");
  const matcher = new RegExp(`^${expression}$`);
  return serverPatternSamples.some((sample) => matcher.test(sample));
}

function isImportMetaUrl(node: ts.Expression | undefined): boolean {
  if (!node) return false;
  node = unwrapExpression(node);
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "url" &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword
  );
}

function isUrlConstructor(
  node: ts.Expression,
  bindings: ReadonlyMap<string, ts.Expression>,
): boolean {
  const resolved = resolveConst(node, bindings);
  return ts.isIdentifier(resolved) && resolved.text === "URL";
}

type AstViolation = {
  readonly kind: "computed-import" | "asset-url";
  readonly pattern: string;
};

function findAstViolation(code: string, id: string): AstViolation | null {
  const sourceFile = ts.createSourceFile(
    id,
    code,
    ts.ScriptTarget.Latest,
    true,
    id.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const bindings = collectConstBindings(sourceFile);
  let violation: AstViolation | null = null;

  const visit = (node: ts.Node): void => {
    if (violation) return;
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const pattern = computedPattern(node.arguments[0], bindings);
      if (pattern && patternCanReachServer(pattern)) {
        violation = { kind: "computed-import", pattern };
      }
    } else if (
      ts.isNewExpression(node) &&
      isUrlConstructor(node.expression, bindings) &&
      isImportMetaUrl(node.arguments?.[1])
    ) {
      const pattern = computedPattern(node.arguments?.[0], bindings);
      if (pattern && patternCanReachServer(pattern)) {
        violation = { kind: "asset-url", pattern };
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violation;
}

function errorMessage(
  id: string,
  kind: string,
  specifier: string,
  root: string,
): string {
  const importer = projectPath(id, root) ?? withoutQuery(id);
  return `${ANALYTICS_CLIENT_BOUNDARY_ERROR}: ${importer} ${kind} ${JSON.stringify(specifier)}`;
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
      if (importer && isAnalyticsServerModule(source, root)) {
        this.error(errorMessage(importer, "resolved-import", source, root));
      }
      return null;
    },
    load(id) {
      if (isAnalyticsServerModule(id, root)) {
        this.error(errorMessage(id, "loaded-module", id, root));
      }
      return null;
    },
    transform(code, id) {
      if (id.startsWith("\0") || id.includes("/node_modules/")) return null;
      const violation = findAstViolation(code, id);
      if (violation) {
        this.error(errorMessage(id, violation.kind, violation.pattern, root));
      }
      return null;
    },
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        for (const output of Object.values(bundle)) {
          const source = output.type === "chunk" ? output.code : output.source;
          const contents = Buffer.from(source);
          const marker = ANALYTICS_SERVER_ARTIFACT_MARKERS.find(
            (candidate) => contents.includes(Buffer.from(candidate)),
          );
          if (marker) {
            this.error(errorMessage(output.fileName, "emitted-artifact", marker, root));
          }
        }
      },
    },
  };
}
