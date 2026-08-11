import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { Plugin } from "vite";

export const ANALYTICS_CLIENT_BOUNDARY_ERROR =
  "analytics-server-module-forbidden-in-client-build";

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

function computedPattern(node: ts.Expression | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) {
    return computedPattern(node.expression);
  }
  if (ts.isTemplateExpression(node)) {
    return `${node.head.text}${node.templateSpans
      .map(
        (span) =>
          `${computedPattern(span.expression) ?? "*"}${span.literal.text}`,
      )
      .join("")}`;
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = computedPattern(node.left);
    const right = computedPattern(node.right);
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
  return Boolean(
    node &&
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "url" &&
      ts.isMetaProperty(node.expression) &&
      node.expression.keywordToken === ts.SyntaxKind.ImportKeyword,
  );
}

type ComputedViolation = {
  readonly kind: "computed-import" | "asset-url";
  readonly pattern: string;
};

function findComputedViolation(code: string, id: string): ComputedViolation | null {
  if (!code.includes("import(") && !code.includes("new URL")) return null;
  const sourceFile = ts.createSourceFile(
    id,
    code,
    ts.ScriptTarget.Latest,
    true,
    id.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let violation: ComputedViolation | null = null;

  const visit = (node: ts.Node): void => {
    if (violation) return;
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      !ts.isStringLiteralLike(node.arguments[0])
    ) {
      const pattern = computedPattern(node.arguments[0]);
      if (pattern && patternCanReachServer(pattern)) {
        violation = { kind: "computed-import", pattern };
      }
    } else if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "URL" &&
      isImportMetaUrl(node.arguments?.[1])
    ) {
      const pattern = computedPattern(node.arguments?.[0]);
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
      const violation = findComputedViolation(code, id);
      if (violation) {
        this.error(errorMessage(id, violation.kind, violation.pattern, root));
      }
      return null;
    },
  };
}
