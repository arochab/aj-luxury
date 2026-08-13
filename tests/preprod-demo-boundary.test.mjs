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

test("the real current source branch is governed while main and foreign branches stay closed", () => {
  assert.ok(currentSourceBranch);
  assert.equal(marker.allowed_source_branches.includes(currentSourceBranch), true);
  assert.equal(check({
    GITHUB_HEAD_REF: "",
    GITHUB_REF_NAME: currentSourceBranch,
  }).status, 0);
  assert.notEqual(check({ GITHUB_HEAD_REF: "", GITHUB_REF_NAME: "main" }).status, 0);
  assert.notEqual(check({
    GITHUB_HEAD_REF: "",
    GITHUB_REF_NAME: "codex/foreign-unreviewed-branch",
  }).status, 0);
});
