import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

export const ANALYTICS_CLIENT_BOUNDARY_ERROR = "analytics-server-module-forbidden-in-client-build";
// Every current analytics server entry contains at least one of these bytes.
// They are checked in emitted Vite chunks/assets and again in dist/client.
export const ANALYTICS_SERVER_ARTIFACT_MARKERS = [
  "order_paid",
  "analytics_server_recorder_not_implemented",
  "storeOnce",
  "#analytics-server-only",
  "#analytics-server-runtime",
  "#analytics-server-entry-is-not-browser-bundleable",
  "analyticsServerRuntime",
] as const;
const serverModulePattern =
  /^(?:lib\/analytics\/server(?:-[^/]*)?\.[cm]?[jt]sx?|lib\/analytics\/server\/)/;
const BUILD_CANARIES = {
  raw: "tests/fixtures/analytics-client-boundary/raw.mjs",
  url: "tests/fixtures/analytics-client-boundary/url.mjs",
  js: "tests/fixtures/analytics-client-boundary/asset-js.mjs",
  txt: "tests/fixtures/analytics-client-boundary/asset-non-js.mjs",
} as const;
function withoutQuery(value: string): string {
  const clean = value.startsWith("\0") ? value.slice(1) : value;
  const queryIndex = clean.search(/[?#]/);
  return queryIndex === -1 ? clean : clean.slice(0, queryIndex);
}

function projectPath(id: string, root: string): string | null {
  let value = withoutQuery(id);
  try {
    value = decodeURIComponent(value);
  } catch {
    // Vite can expose an undecodable virtual id. It is not a project path.
  }
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
    value = value.replace(/^\/?@\//, "").replace(/^\.\//, "");
  }

  return value.replaceAll("\\", "/").toLowerCase();
}

export function isAnalyticsServerModule(id: string, root: string): boolean {
  const normalized = projectPath(id, resolve(root));
  return normalized !== null && serverModulePattern.test(normalized);
}

export function findAnalyticsServerArtifactMarker(
  source: string | Uint8Array,
): (typeof ANALYTICS_SERVER_ARTIFACT_MARKERS)[number] | undefined {
  const contents = Buffer.from(source);
  const candidates = [contents];
  const text = contents.toString("utf8");
  for (const match of text.matchAll(/data:[^,\s"'`]+,([^\s"'`)]+)/gi)) {
    const encoded = match[1];
    if (
      match[0]
        .slice(0, match[0].indexOf(","))
        .toLowerCase()
        .endsWith(";base64")
    ) {
      candidates.push(Buffer.from(encoded, "base64"));
    } else {
      try {
        candidates.push(Buffer.from(decodeURIComponent(encoded)));
      } catch {
        // A malformed data URI cannot contain decoded server capability bytes.
      }
    }
  }
  return ANALYTICS_SERVER_ARTIFACT_MARKERS.find((marker) => {
    const bytes = Buffer.from(marker);
    return candidates.some((candidate) => candidate.includes(bytes));
  });
}

function errorMessage(
  id: string,
  kind: string,
  detail: string,
  root: string,
): string {
  const subject = projectPath(id, root) ?? withoutQuery(id);
  return `${ANALYTICS_CLIENT_BOUNDARY_ERROR}: ${subject} ${kind} ${JSON.stringify(detail)}`;
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
    buildStart() {
      const canary = process.env.ANALYTICS_CLIENT_BOUNDARY_CANARY;
      if (!canary) return;
      const fixture = BUILD_CANARIES[canary as keyof typeof BUILD_CANARIES];
      if (!fixture) {
        this.error(`${ANALYTICS_CLIENT_BOUNDARY_ERROR}: unknown build canary`);
      }
      this.emitFile({ type: "chunk", id: resolve(root, fixture) });
    },
    async resolveId(source, importer, options) {
      if (!importer) return null;
      const resolvedModule = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (resolvedModule && isAnalyticsServerModule(resolvedModule.id, root)) {
        this.error(
          errorMessage(importer, "resolved-module", resolvedModule.id, root),
        );
      }
      return null;
    },
    load(id) {
      if (isAnalyticsServerModule(id, root)) {
        this.error(errorMessage(id, "loaded-module", id, root));
      }
      return null;
    },
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type === "chunk") {
            const serverModule = output.moduleIds.find((id) =>
              isAnalyticsServerModule(id, root),
            );
            if (serverModule) {
              this.error(
                errorMessage(
                  output.fileName,
                  "emitted-server-module",
                  serverModule,
                  root,
                ),
              );
            }
          }

          const source = output.type === "chunk" ? output.code : output.source;
          const marker = findAnalyticsServerArtifactMarker(source);
          if (marker) {
            this.error(
              errorMessage(output.fileName, "emitted-artifact", marker, root),
            );
          }
        }
      },
    },
  };
}
