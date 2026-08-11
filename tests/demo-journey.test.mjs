import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    }),
  );
  return nested.flat();
}

async function source(path) {
  return readFile(join(root, path), "utf8");
}

test("the deterministic journey links every customer-facing scene", async () => {
  const control = await source("app/demo-control/page.tsx");
  const expectedRoutes = [
    "/cart",
    "/checkout",
    "/checkout/confirmation?destination=FR",
    "/account",
    "/account/orders/AJ-DEMO-1042",
    "/return",
    "/refund",
  ];
  for (const route of expectedRoutes) assert.equal(control.includes(route), true, route);

  const checkout = await source("app/components/demo/DemoCheckoutJourney.tsx");
  assert.match(checkout, /<form[^>]*onSubmit=/);
  assert.match(checkout, /type="radio"/);
  assert.match(checkout, /name="destination"/);
  assert.match(checkout, /router\.push\(`\/checkout\/confirmation\?destination=\$\{destination\}`\)/);
  assert.match(checkout, /type="submit"/);

  const returns = await source("app/components/demo/DemoReturnRefund.tsx");
  assert.match(returns, /<form[^>]*onSubmit=/);
  assert.match(returns, /type="checkbox"/);
  assert.match(returns, /<select/);
  assert.match(returns, /aria-live="polite"/);
  assert.match(returns, /disabled=\{!selected\}/);
  assert.match(returns, /if \(!selected\) return/);
});

test("DHL official wordmark stays an unambiguous demo-only simulation", async () => {
  const demoFiles = await walk(join(root, "app", "components", "demo"));
  const demoSource = (
    await Promise.all(
      demoFiles
        .filter((file) => [".ts", ".tsx"].includes(extname(file)))
        .map((file) => readFile(file, "utf8")),
    )
  ).join("\n");
  const fixtureSource = await source("lib/demo/customer-journey.ts");
  const officialLogo = await source("app/components/demo/assets/dhl-logo.svg");
  const canonicalLogo = officialLogo.replace(/\r?\n$/, "");

  assert.match(fixtureSource, /DHL Express/);
  assert.match(demoSource, /DhlSimulationMark/);
  assert.match(demoSource, /SIMULATION/);
  assert.match(
    demoSource,
    /Aucun\s+service DHL n’est connecté/,
  );
  assert.match(demoSource, /simulation sans service connecté/);
  assert.match(officialLogo, /fill="#d40511"/);
  assert.equal(
    createHash("sha256").update(canonicalLogo).digest("hex").toUpperCase(),
    "328777BE6ED92AE88755009A974A1283ABF795957A3DF244576ED70F5DE4E9C3",
  );

  const publicFiles = await walk(join(root, "public"));
  assert.deepEqual(
    publicFiles.filter((file) => /dhl/i.test(relative(root, file))),
    [],
  );
});

test("demo sources contain no external I/O, persistence, real provider or card capture", async () => {
  const files = [
    ...(await walk(join(root, "app", "components", "demo"))),
    ...(await walk(join(root, "lib", "demo"))),
    ...(await walk(join(root, "app", "checkout"))),
    ...(await walk(join(root, "app", "account"))),
    ...(await walk(join(root, "app", "return"))),
    ...(await walk(join(root, "app", "refund"))),
    ...(await walk(join(root, "app", "demo-control"))),
  ].filter((file) => [".ts", ".tsx", ".css"].includes(extname(file)));
  const combined = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");

  for (const forbidden of [
    /https?:\/\//i,
    /\bfetch\s*\(/,
    /XMLHttpRequest|WebSocket|EventSource/,
    /document\.cookie|localStorage|sessionStorage/,
    /Set-Cookie/i,
    /sk_live_|pk_live_|client_secret/i,
    /stripe|paypal|adyen/i,
    /d1-fulfillment|fulfillment-domain|D1Database/i,
    /autoComplete="cc-|name="card|name="cvc|name="expiry/i,
  ]) {
    assert.doesNotMatch(combined, forbidden);
  }
});

test("all demo route copy is explicit about fictitious and non-contractual state", async () => {
  const combined = (
    await Promise.all(
      [
        "app/cart/page.tsx",
        "app/checkout/page.tsx",
        "app/checkout/confirmation/page.tsx",
        "app/account/page.tsx",
        "app/account/orders/AJ-DEMO-1042/page.tsx",
        "app/return/page.tsx",
        "app/refund/page.tsx",
        "app/demo-control/page.tsx",
      ].map(source),
    )
  ).join("\n");

  assert.match(combined, /fictif|fictive/i);
  assert.match(combined, /simul/i);
  assert.match(combined, /Aucun débit/);
  assert.match(combined, /Aucun\s+service DHL n’est\s+connecté/);
});
