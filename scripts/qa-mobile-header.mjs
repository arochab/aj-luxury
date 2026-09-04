import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseUrl = process.env.AJ_QA_URL ?? "http://127.0.0.1:4186/";
const evidenceRoot = new URL("../artifacts/mobile-header-qa/", import.meta.url);
await mkdir(evidenceRoot, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

function assertInsideViewport(box, viewport, label) {
  assert(box, `${label}: visible bounding box`);
  assert(box.x >= -0.5, `${label}: left edge inside viewport`);
  assert(box.y >= -0.5, `${label}: top edge inside viewport`);
  assert(box.x + box.width <= viewport.width + 0.5, `${label}: right edge inside viewport`);
  assert(box.y + box.height <= viewport.height + 0.5, `${label}: bottom edge inside viewport`);
}

function rectanglesOverlap(first, second) {
  return first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y;
}

async function inspectMobile(viewport, pathname = "/", capture = true) {
  const context = await browser.newContext({
    viewport,
    hasTouch: true,
    isMobile: true,
    locale: "fr-FR",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(new URL(pathname, baseUrl).href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.evaluate(() => Promise.race([
    document.fonts.ready,
    new Promise((resolve) => window.setTimeout(resolve, 3_000)),
  ]));

  const header = page.locator("header").first();
  await header.waitFor({ state: "visible" });
  await header.locator('a[href="/account"]').waitFor({ state: "visible" });
  const brand = header.locator(':scope > a[href="/"]');
  const language = header.locator("#language-switcher-header");
  const account = header.locator('a[href="/account"]');
  const cart = header.locator('a[href="/cart"]');
  const home = header.locator('nav a[href="/"]');
  const shop = header.locator('nav a[href="/shop"]');
  const story = header.locator('nav a[href="/notre-histoire"]');
  const required = { brand, language, account, cart, home, shop, story };

  for (const [label, locator] of Object.entries(required)) {
    assert.equal(await locator.count(), 1, `${viewport.width}px ${pathname} ${label}: rendered once`);
    assert.equal(await locator.isVisible(), true, `${viewport.width}px ${pathname} ${label}: visible`);
  }

  assert.equal(await account.textContent(), "Compte", `${viewport.width}px: Compte is present`);
  assert.equal(await cart.textContent(), "Panier", `${viewport.width}px: Panier is present`);
  assert.equal(await language.inputValue(), "fr", `${viewport.width}px: FR is selected`);

  const boxes = Object.fromEntries(await Promise.all(
    Object.entries(required).map(async ([label, locator]) => [label, await locator.boundingBox()]),
  ));
  for (const [label, box] of Object.entries(boxes)) {
    assertInsideViewport(box, viewport, `${viewport.width}px ${pathname} ${label}`);
  }

  const topRow = ["brand", "language", "account", "cart"];
  for (let first = 0; first < topRow.length; first += 1) {
    for (let second = first + 1; second < topRow.length; second += 1) {
      assert.equal(
        rectanglesOverlap(boxes[topRow[first]], boxes[topRow[second]]),
        false,
        `${viewport.width}px: ${topRow[first]} and ${topRow[second]} do not collide`,
      );
    }
  }

  const layout = await header.evaluate((node) => {
    const interactive = [...node.querySelectorAll("a, select")];
    return {
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      headerOverflow: node.scrollWidth - node.clientWidth,
      height: node.getBoundingClientRect().height,
      links: Object.fromEntries(
        [...node.querySelectorAll("a")].map((link) => [
          link.getAttribute("href"),
          link.textContent?.trim() || link.getAttribute("aria-label"),
        ]),
      ),
      targets: interactive.map((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return {
          name: element.getAttribute("href") || element.id,
          hit: Boolean(hit && (hit === element || element.contains(hit))),
          width: rect.width,
          height: rect.height,
          contentOverflowX: element.scrollWidth - element.clientWidth,
          contentOverflowY: element.scrollHeight - element.clientHeight,
        };
      }),
    };
  });

  assert(layout.documentOverflow <= 0, `${viewport.width}px: no document overflow`);
  assert(layout.headerOverflow <= 0, `${viewport.width}px: no header overflow`);
  assert(layout.height <= 160, `${viewport.width}px: compact two-row header`);
  assert.equal(layout.links["/account"], "Compte", `${viewport.width}px: account href is correct`);
  assert.equal(layout.links["/cart"], "Panier", `${viewport.width}px: cart href is correct`);
  for (const target of layout.targets) {
    assert.equal(target.hit, true, `${viewport.width}px ${target.name}: center is clickable`);
    assert(target.height >= 44, `${viewport.width}px ${target.name}: target is at least 44px tall`);
    assert(target.contentOverflowX <= 1, `${viewport.width}px ${target.name}: text does not overflow horizontally`);
    assert(
      target.contentOverflowY <= 12,
      `${viewport.width}px ${target.name}: only the designed underline may extend vertically`,
    );
  }

  for (const locale of ["en", "de", "es", "it", "fr"]) {
    await language.selectOption(locale);
    await page.waitForTimeout(30);
    const translatedLayout = await header.evaluate((node) => ({
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      headerOverflow: node.scrollWidth - node.clientWidth,
      hiddenLinks: [...node.querySelectorAll("a")].filter((link) => {
        const rect = link.getBoundingClientRect();
        return rect.width === 0 || rect.height === 0 || rect.right > innerWidth + 0.5 || rect.left < -0.5;
      }).length,
    }));
    assert.equal(translatedLayout.documentOverflow, 0, `${viewport.width}px ${locale}: no page overflow`);
    assert(translatedLayout.headerOverflow <= 0, `${viewport.width}px ${locale}: no header overflow`);
    assert.equal(translatedLayout.hiddenLinks, 0, `${viewport.width}px ${locale}: every link remains visible`);
  }

  let screenshot = null;
  if (capture) {
    const pathSlug = pathname === "/" ? "home" : pathname.slice(1).replaceAll("/", "-");
    screenshot = fileURLToPath(new URL(`${pathSlug}-${viewport.width}.png`, evidenceRoot));
    await header.screenshot({ path: screenshot });
  }
  assert.deepEqual(errors, [], `${viewport.width}px ${pathname}: no browser errors`);
  await context.close();
  return { viewport, pathname, boxes, layout, screenshot };
}

const results = [];
for (const viewport of [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  results.push(await inspectMobile(viewport));
}
results.push(await inspectMobile({ width: 390, height: 844 }, "/shop"));
results.push(await inspectMobile({ width: 390, height: 844 }, "/notre-histoire"));

const desktopContext = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "fr-FR",
});
const desktopPage = await desktopContext.newPage();
await desktopPage.goto(new URL("/", baseUrl).href, { waitUntil: "domcontentloaded" });
const desktopHeader = desktopPage.locator("header").first();
const desktopLayout = await desktopHeader.evaluate((node) => ({
  documentOverflow: document.documentElement.scrollWidth - innerWidth,
  gridTemplateColumns: getComputedStyle(node).gridTemplateColumns,
  height: node.getBoundingClientRect().height,
  visibleLinks: [...node.querySelectorAll("a")].filter((link) => {
    const rect = link.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }).length,
}));
assert.equal(desktopLayout.documentOverflow, 0, "desktop: no document overflow");
assert.equal(desktopLayout.height, 92, "desktop: original 5.75rem header height is preserved");
assert.equal(desktopLayout.visibleLinks, 6, "desktop: brand and five navigation links remain visible");
const desktopScreenshot = fileURLToPath(new URL("home-desktop-1440.png", evidenceRoot));
await desktopHeader.screenshot({ path: desktopScreenshot });
await desktopContext.close();
await browser.close();

const report = {
  baseUrl,
  generatedAt: new Date().toISOString(),
  results,
  desktop: { ...desktopLayout, screenshot: desktopScreenshot },
};
await writeFile(
  new URL("report.json", evidenceRoot),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
