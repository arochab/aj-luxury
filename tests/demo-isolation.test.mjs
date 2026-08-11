import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertDemoRuntime,
  DemoRuntimeDeniedError,
  isDemoRoute,
} from "../lib/demo/runtime-guard.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

test("runtime guard is fail-closed and host allowlisting is exact", () => {
  assert.deepEqual(
    assertDemoRuntime({
      runtime: "demo",
      environment: "preproduction",
      host: "localhost:3000",
    }),
    {
      runtime: "demo",
      environment: "preproduction",
      host: "localhost:3000",
    },
  );

  assert.deepEqual(
    assertDemoRuntime({
      runtime: "demo",
      environment: "preproduction",
      host: "localhost:3107",
    }),
    {
      runtime: "demo",
      environment: "preproduction",
      host: "localhost:3107",
    },
  );

  for (const input of [
    { runtime: undefined, environment: undefined, host: undefined },
    { runtime: "production", environment: "preproduction", host: "localhost:3000" },
    { runtime: "demo", environment: "production", host: "localhost:3000" },
    { runtime: "demo", environment: "preproduction", host: "ajluxurystore.com" },
    { runtime: "demo", environment: "preproduction", host: "localhost:3000.evil.test" },
    { runtime: "demo", environment: "preproduction", host: "localhost:3000,evil.test" },
  ]) {
    assert.throws(() => assertDemoRuntime(input), DemoRuntimeDeniedError);
  }
});

test("only explicit private customer-journey paths are classified as demo routes", () => {
  for (const pathname of [
    "/cart",
    "/checkout",
    "/checkout/confirmation",
    "/account",
    "/account/orders/AJ-DEMO-1042",
    "/return",
    "/refund",
    "/demo-control",
  ]) {
    assert.equal(isDemoRoute(pathname), true, pathname);
  }
  for (const pathname of ["/", "/shop", "/products/pourpre", "/accounting", "/returns"]) {
    assert.equal(isDemoRoute(pathname), false, pathname);
  }

  for (const pathname of [
    "/%61ccount",
    "/%2561ccount",
    "/%63art",
    "/%63heckout",
    "/%72eturn",
    "/%72efund",
    "/%64emo-control",
    "/%E0%A4%A",
  ]) {
    assert.equal(isDemoRoute(pathname), true, pathname);
  }

  let deeplyEncoded = "/account";
  for (let pass = 0; pass < 4_000; pass += 1) {
    deeplyEncoded = encodeURIComponent(deeplyEncoded);
  }
  const startedAt = performance.now();
  assert.equal(isDemoRoute(deeplyEncoded), true);
  assert.ok(performance.now() - startedAt < 50);
});

test("production build boundary rejects demo modules and the synthetic DHL marker", () => {
  const production = spawnSync(
    process.execPath,
    ["scripts/check-demo-production-boundary.mjs"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        AJ_RUNTIME: "production",
        AJ_ENVIRONMENT: "production",
      },
    },
  );
  assert.equal(production.status, 1);
  assert.match(production.stderr, /production build blocked/i);
  assert.match(production.stderr, /lib\/demo/);
  assert.match(production.stderr, /app\/components\/demo/);
  assert.match(production.stderr, /DEMO-DHL/);

  const demo = spawnSync(
    process.execPath,
    ["scripts/check-demo-production-boundary.mjs"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        AJ_RUNTIME: "demo",
        AJ_ENVIRONMENT: "preproduction",
      },
    },
  );
  assert.equal(demo.status, 0, demo.stderr);
  assert.match(demo.stdout, /authorized preproduction build/i);
});

test("validated home, shop and product routes remain byte-identical to I06", () => {
  const diff = spawnSync(
    "git",
    [
      "diff",
      "--exit-code",
      "f5ba52d94c53963f52a24b9edcc6c84033b2f1f6",
      "--",
      "app/page.tsx",
      "app/shop/page.tsx",
      "app/products/[slug]/page.tsx",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(diff.status, 0, diff.stdout + diff.stderr);
});

test("edge and page guards enforce private no-store and noindex behavior", async () => {
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /private, no-store, max-age=0/);
  assert.match(worker, /noindex, nofollow, noarchive/);
  assert.match(worker, /assertDemoRuntime/);
  assert.match(worker, /denyDemoRequest/);
  assert.match(worker, /host:\s*url\.host/);
  assert.doesNotMatch(worker, /x-forwarded-host/);

  for (const path of [
    "../app/cart/page.tsx",
    "../app/checkout/page.tsx",
    "../app/checkout/confirmation/page.tsx",
    "../app/account/page.tsx",
    "../app/account/orders/AJ-DEMO-1042/page.tsx",
    "../app/return/page.tsx",
    "../app/refund/page.tsx",
    "../app/demo-control/page.tsx",
  ]) {
    const page = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(page, /index: false/);
    assert.match(page, /follow: false/);
    assert.match(page, /dynamic = "force-dynamic"/);
    assert.match(page, /revalidate = 0/);
  }
});
