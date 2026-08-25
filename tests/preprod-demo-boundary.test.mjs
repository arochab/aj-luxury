import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const project = new URL("../", import.meta.url);
const marker = JSON.parse(await readFile(
  new URL(".openai/preprod-demo-only.json", project),
  "utf8",
));
const hosting = JSON.parse(await readFile(
  new URL(".openai/hosting.json", project),
  "utf8",
));
const localBranch = spawnSync("git", ["branch", "--show-current"], {
  cwd: fileURLToPath(project),
  encoding: "utf8",
});
assert.equal(localBranch.status, 0);
const currentSourceBranch = process.env.GITHUB_ACTIONS === "true"
  ? process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME
  : localBranch.stdout.trim();

function check(overrides = {}) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/check-preprod-demo-boundary.mjs"],
    {
      cwd: fileURLToPath(project),
      encoding: "utf8",
      env: {
        ...process.env,
        APP_ENV: "preproduction",
        PREPROD_TARGET_PROJECT_ID: marker.project_id,
        GITHUB_ACTIONS: "true",
        GITHUB_REF_NAME: "codex/lot2-preprod-synthetic-demo-20260813",
        GITHUB_HEAD_REF: "",
        GITHUB_BASE_REF: "candidate/preprod-only",
        ...overrides,
      },
    },
  );
}

function productionCheck(overrides = {}) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/check-preprod-demo-boundary.mjs"],
    {
      cwd: fileURLToPath(project),
      encoding: "utf8",
      env: {
        ...process.env,
        APP_ENV: "production",
        PREPROD_TARGET_PROJECT_ID: undefined,
        GITHUB_ACTIONS: "true",
        GITHUB_REF_NAME: currentSourceBranch,
        GITHUB_HEAD_REF: "",
        GITHUB_BASE_REF: "main",
        ...overrides,
      },
    },
  );
}

test("synthetic demo build boundary requires the exact preproduction target", () => {
  assert.equal(check().status, 0);
  assert.equal(check({
    GITHUB_REF_NAME: "codex/lot2-preprod-owner-account-tracking-20260813",
  }).status, 0);
  assert.notEqual(check({ APP_ENV: "production" }).status, 0);
  assert.notEqual(check({ PREPROD_TARGET_PROJECT_ID: "wrong-project" }).status, 0);
  assert.notEqual(check({ GITHUB_REF_NAME: "main" }).status, 0);
  assert.notEqual(check({ GITHUB_BASE_REF: "main" }).status, 0);
  assert.notEqual(check({ GITHUB_REF_NAME: "candidate/another-branch" }).status, 0);
});

test("the legacy synthetic branch gate remains closed to foreign branches", () => {
  assert.ok(currentSourceBranch);
  assert.notEqual(check({ GITHUB_HEAD_REF: "", GITHUB_REF_NAME: "main" }).status, 0);
  assert.notEqual(check({
    GITHUB_HEAD_REF: "",
    GITHUB_REF_NAME: "codex/foreign-unreviewed-branch",
  }).status, 0);
});

test("production frontend build is D1-detached and target-aware", () => {
  assert.equal(hosting.d1, null);
  assert.ok([
    "appgprj_6a81995167048191b50b37833695f3dc",
    "appgprj_6a63835f347c819187cdbb7ee16641cc",
  ].includes(hosting.project_id));
  assert.equal(productionCheck().status, 0);
  assert.notEqual(productionCheck({ PREPROD_TARGET_PROJECT_ID: marker.project_id }).status, 0);
  assert.notEqual(productionCheck({ APP_ENV: "staging" }).status, 0);
});
