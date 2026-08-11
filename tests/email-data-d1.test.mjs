import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const workspaceWrangler = fileURLToPath(
  new URL("../../../node_modules/wrangler/wrangler-dist/cli.js", import.meta.url),
);
const migrationNames = [
  "0000_flimsy_rhino.sql",
  "0001_lock_cart_line_price_provenance.sql",
  "0002_lock_order_line_snapshots.sql",
  "0003_identity_access.sql",
  "0004_email_outbox_data_rights.sql",
];

function environment(proofRoot) {
  const temp = join(proofRoot, "temp");
  mkdirSync(temp, { recursive: true });
  const result = {
    CI: "1",
    FORCE_COLOR: "0",
    MINIFLARE_REGISTRY_PATH: join(proofRoot, "registry"),
    NO_COLOR: "1",
    NO_UPDATE_NOTIFIER: "1",
    TEMP: temp,
    TMP: temp,
    WRANGLER_HIDE_BANNER: "true",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_WRITE_LOGS: "false",
  };
  for (const name of ["ComSpec", "Path", "PATH", "SystemRoot", "WINDIR"]) {
    if (process.env[name]) result[name] = process.env[name];
  }
  return result;
}

function createConfig(proofRoot, names) {
  const migrationRoot = join(proofRoot, "migrations");
  mkdirSync(migrationRoot, { recursive: true });
  for (const name of names) {
    copyFileSync(join(projectRoot, "drizzle", name), join(migrationRoot, name));
  }
  writeFileSync(join(proofRoot, "worker.js"), "export default { fetch() { return new Response('local'); } };\n");
  const configPath = join(proofRoot, "wrangler.json");
  writeFileSync(configPath, JSON.stringify({
    name: "aj-luxury-d02-local-proof",
    main: "worker.js",
    compatibility_date: "2026-08-11",
    d1_databases: [{
      binding: "DB",
      database_name: "aj-luxury-d02-local",
      database_id: "00000000-0000-4000-8000-000000000000",
      migrations_dir: "migrations",
    }],
  }));
  return configPath;
}

function run(args, proofRoot, expectFailure = false) {
  const result = spawnSync(process.execPath, [workspaceWrangler, ...args], {
    cwd: proofRoot,
    encoding: "utf8",
    env: environment(proofRoot),
    timeout: 60_000,
    windowsHide: true,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
  assert.equal(result.error, undefined, output);
  if (expectFailure) assert.notEqual(result.status, 0, output);
  else assert.equal(result.status, 0, output);
  return output;
}

function apply(configPath, state, proofRoot) {
  return run([
    "d1", "migrations", "apply", "DB", "--local", "--config", configPath,
    "--persist-to", state,
  ], proofRoot);
}

function query(configPath, state, proofRoot, command) {
  const output = run([
    "d1", "execute", "DB", "--local", "--config", configPath,
    "--persist-to", state, "--command", command, "--json",
  ], proofRoot);
  return JSON.parse(output)[0].results;
}

test("real local D1 applies 0000 through 0004, upgrades 0003 and replays without drift", (t) => {
  assert.ok(existsSync(workspaceWrangler), "workspace Wrangler must exist");
  const proofParent = join(projectRoot, ".wrangler");
  mkdirSync(proofParent, { recursive: true });
  const proofRoot = mkdtempSync(join(proofParent, "d02-"));
  assert.ok(!relative(projectRoot, proofRoot).startsWith(".."));
  t.after(() => rmSync(proofRoot, { recursive: true, force: true, maxRetries: 5 }));

  const emptyRoot = join(proofRoot, "empty");
  mkdirSync(emptyRoot);
  const emptyConfig = createConfig(emptyRoot, migrationNames);
  const emptyState = join(emptyRoot, "state");
  apply(emptyConfig, emptyState, emptyRoot);
  const firstRows = query(emptyConfig, emptyState, emptyRoot,
    "SELECT name FROM d1_migrations ORDER BY id");
  assert.deepEqual(firstRows.map((row) => row.name), migrationNames);
  apply(emptyConfig, emptyState, emptyRoot);
  assert.deepEqual(query(emptyConfig, emptyState, emptyRoot,
    "PRAGMA foreign_key_check"), []);
  assert.deepEqual(query(emptyConfig, emptyState, emptyRoot,
    "SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('email_outbox','data_rights_requests','data_retention_rules') ORDER BY name"
  ).map((row) => row.name), ["data_retention_rules", "data_rights_requests", "email_outbox"]);

  const upgradeRoot = join(proofRoot, "upgrade");
  mkdirSync(upgradeRoot);
  const upgradeConfig = createConfig(upgradeRoot, migrationNames.slice(0, 4));
  const upgradeState = join(upgradeRoot, "state");
  apply(upgradeConfig, upgradeState, upgradeRoot);
  query(upgradeConfig, upgradeState, upgradeRoot,
    `INSERT INTO audit_log (id, actor_type, action, entity_type, entity_id,
      idempotency_key, metadata_json, created_at) VALUES ('d02_d1_sentinel',
      'system', 'sentinel', 'migration', '0003', 'd02:d1:sentinel', '{}',
      '2026-08-11T12:00:00.000Z')`);
  copyFileSync(
    join(projectRoot, "drizzle", migrationNames.at(-1)),
    join(upgradeRoot, "migrations", migrationNames.at(-1)),
  );
  apply(upgradeConfig, upgradeState, upgradeRoot);
  apply(upgradeConfig, upgradeState, upgradeRoot);
  assert.equal(query(upgradeConfig, upgradeState, upgradeRoot,
    "SELECT COUNT(*) AS count FROM audit_log WHERE id='d02_d1_sentinel'"
  )[0].count, 1);
  assert.deepEqual(query(upgradeConfig, upgradeState, upgradeRoot,
    "PRAGMA foreign_key_check"), []);
});
