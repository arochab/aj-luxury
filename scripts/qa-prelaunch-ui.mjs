import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseUrl = process.env.AJ_QA_URL ?? "http://127.0.0.1:3035/";
const evidenceRoot = new URL(
  "../docs/internal/evidence/prelaunch-2026-09-03/",
  import.meta.url,
);
await mkdir(evidenceRoot, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

async function readyPage(viewport, hasTouch = false) {
  const context = await browser.newContext({
    viewport,
    hasTouch,
    isMobile: hasTouch,
    locale: "fr-FR",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.evaluate(() => Promise.race([
    document.fonts.ready,
    new Promise((resolve) => window.setTimeout(resolve, 4_000)),
  ]));
  await page.waitForTimeout(500);
  return { context, errors, page };
}

const mobileResults = [];
for (const viewport of [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  const run = await readyPage(viewport, true);
  const rail = run.page.locator('[data-home-horizontal-rail="v48"]');
  await rail.scrollIntoViewIfNeeded();
  await run.page.waitForTimeout(250);
  await rail.locator("img").evaluateAll((images) => Promise.all(
    images.map((image) => image.decode().catch(() => undefined)),
  ));

  const result = await rail.locator("article").first().evaluate((panel) => {
    const section = panel.closest("section");
    const title = [...(section?.querySelectorAll("h2") ?? [])].find(
      (node) => node.getBoundingClientRect().height > 0,
    );
    const media = panel.querySelector("figure")?.parentElement;
    const model = [...panel.querySelectorAll("img")].find((image) =>
      image.alt.includes("Alex"));
    const titleRect = title?.getBoundingClientRect();
    const mediaRect = media?.getBoundingClientRect();
    const viewportNode = panel.closest('[aria-label="Collection Apollon, trois coloris"]');
    return {
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      gapBetweenTitleAndMedia:
        titleRect && mediaRect ? mediaRect.top - titleRect.bottom : null,
      imageFailures: [...panel.querySelectorAll("img")].filter(
        (image) => !image.complete || image.naturalWidth === 0,
      ).length,
      modelAlt: model?.alt ?? null,
      modelObjectFit: model ? getComputedStyle(model).objectFit : null,
      modelSource: model?.getAttribute("src") ?? null,
      panelWidth: panel.getBoundingClientRect().width,
      railClientWidth: viewportNode?.clientWidth ?? null,
      railScrollWidth: viewportNode?.scrollWidth ?? null,
    };
  });

  assert.equal(result.documentOverflow, 0, `${viewport.width}px: no page overflow`);
  assert.equal(result.imageFailures, 0, `${viewport.width}px: images decode`);
  assert(
    result.gapBetweenTitleAndMedia !== null && result.gapBetweenTitleAndMedia >= 12,
    `${viewport.width}px: title and media must not overlap`,
  );
  assert.equal(result.modelAlt, "Apollon Pourpre Impérial porté par Alex");
  assert.equal(result.modelObjectFit, "contain");
  assert.match(
    result.modelSource ?? "",
    /apollon-pourpre-alex-video-full-v1/,
  );
  assert(
    result.railScrollWidth >= result.railClientWidth * 3 &&
      result.railScrollWidth <= result.railClientWidth * 3 + 120,
    `${viewport.width}px: three full panels plus the two designed transitions`,
  );

  const screenshot = fileURLToPath(new URL(`mobile-${viewport.width}.png`, evidenceRoot));
  await run.page.screenshot({ path: screenshot });
  mobileResults.push({ viewport, ...result, screenshot });
  assert.deepEqual(run.errors, [], `${viewport.width}px console errors`);
  await run.context.close();
}

const desktop = await readyPage({ width: 1440, height: 900 });
const desktopRail = desktop.page.locator('[data-home-horizontal-rail="v48"]');
await desktopRail.evaluate((node) => {
  window.scrollTo({ top: node.offsetTop + 2, behavior: "auto" });
});
await desktop.page.waitForTimeout(350);

const beforeWheel = await desktopRail.evaluate((node) => ({
  scrollY: window.scrollY,
  trackTransform: getComputedStyle(
    node.querySelector('[aria-label="Collection Apollon, trois coloris"]')
      ?.firstElementChild,
  ).transform,
}));
const wheelPrevented = await desktopRail.evaluate((node) => {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaX: 760,
    deltaY: 0,
  });
  node.dispatchEvent(event);
  return event.defaultPrevented;
});
await desktop.page.waitForTimeout(700);
const afterWheel = await desktopRail.evaluate((node) => ({
  documentOverflow: document.documentElement.scrollWidth - innerWidth,
  scrollY: window.scrollY,
  trackTransform: getComputedStyle(
    node.querySelector('[aria-label="Collection Apollon, trois coloris"]')
      ?.firstElementChild,
  ).transform,
}));

assert.equal(wheelPrevented, true, "active desktop rail owns horizontal wheel input");
assert(afterWheel.scrollY > beforeWheel.scrollY + 500, "horizontal wheel advances the scene");
assert.notEqual(afterWheel.trackTransform, beforeWheel.trackTransform, "track visually advances");
assert.equal(afterWheel.documentOverflow, 0, "desktop page does not overflow horizontally");
assert.deepEqual(desktop.errors, [], "desktop console errors");

const desktopScreenshot = fileURLToPath(new URL("desktop-1440.png", evidenceRoot));
await desktop.page.screenshot({ path: desktopScreenshot });
await desktop.context.close();
await browser.close();

const evidence = {
  baseUrl,
  generatedAt: new Date().toISOString(),
  mobile: mobileResults,
  desktop: { beforeWheel, wheelPrevented, afterWheel, screenshot: desktopScreenshot },
};
await writeFile(
  new URL("ui-verification.json", evidenceRoot),
  `${JSON.stringify(evidence, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
