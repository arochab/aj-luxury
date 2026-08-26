import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(testDirectory, "..");

const inheritedDiagnosticBaseline = [
  /^db\/index\.ts\(1,21\): error TS2307:/,
  /^worker\/index\.ts\(7,12\): error TS2304:/,
  /^worker\/index\.ts\(8,7\): error TS2552:/,
  /^worker\/index\.ts\(187,11\): error TS2304:/,
  /^worker\/index\.ts\(207,19\): error TS18047:/,
  /^worker\/index\.ts\(215,19\): error TS18047:/,
  /^worker\/index\.ts\(254,11\): error TS2304:/,
];

test("Lot 2 adds zero diagnostics to the root TypeScript project", async () => {
  const rootConfig = JSON.parse(
    await readFile(join(projectRoot, "tsconfig.json"), "utf8"),
  );
  const analyticsConfig = JSON.parse(
    await readFile(join(projectRoot, "tsconfig.analytics.json"), "utf8"),
  );
  assert.equal(rootConfig.compilerOptions.allowImportingTsExtensions, true);
  assert.equal(analyticsConfig.exclude, undefined);

  const result = spawnSync(
    process.execPath,
    [
      join(projectRoot, "node_modules", "typescript", "bin", "tsc"),
      "--noEmit",
      "--incremental",
      "false",
      "--pretty",
      "false",
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.ok(
    result.status === 0 || result.status === 2,
    result.error?.message ?? result.stderr,
  );

  const diagnostics = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .filter((line) => /: error TS\d+:/.test(line));
  const unexpected = diagnostics.filter(
    (line) => !inheritedDiagnosticBaseline.some((pattern) => pattern.test(line)),
  );

  assert.deepEqual(unexpected, []);
  assert.ok(diagnostics.length <= inheritedDiagnosticBaseline.length);
  assert.ok(
    diagnostics.every(
      (line) =>
        !/^(?:lib\/analytics\/|tests\/analytics-contract-types\.ts|lib\/commerce\/catalog\.ts|lib\/products\.ts|app\/components\/ProductPurchase\.tsx)/.test(
          line,
        ),
    ),
  );
});
