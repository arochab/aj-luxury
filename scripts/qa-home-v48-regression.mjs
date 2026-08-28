import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseUrl = process.env.AJ_QA_URL ?? "http://127.0.0.1:3017/";
const evidenceRoot = new URL("../artifacts/v48-mobile-regression/", import.meta.url);
await mkdir(evidenceRoot, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

async function openPage(viewport, hasTouch = false) {
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

async function swipeRail(page) {
  const viewport = page.locator('[aria-label="Collection Apollon, trois coloris"]');
  const box = await viewport.boundingBox();
  assert(box, "mobile rail viewport must be visible");
  const client = await page.context().newCDPSession(page);
  const y = box.y + box.height * 0.58;
  const fromX = box.x + box.width * 0.86;
  const toX = box.x + box.width * 0.14;

  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: fromX, y }],
  });
  for (let step = 1; step <= 8; step += 1) {
    const x = fromX + ((toX - fromX) * step) / 8;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y }],
    });
    await page.waitForTimeout(18);
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(420);
}

const mobile = await openPage({ width: 390, height: 844 }, true);
await mobile.page.screenshot({
  path: fileURLToPath(new URL("mobile-hero.png", evidenceRoot)),
});
await mobile.page.waitForTimeout(2_600);
await mobile.page.screenshot({
  path: fileURLToPath(new URL("mobile-hero-video.png", evidenceRoot)),
});

const mobileHero = await mobile.page.evaluate(() => {
  const poster = document.querySelector(".aj-film__hero-poster img");
  const stage = document.querySelector(".aj-film__hero-stage");
  const posterStyle = poster ? getComputedStyle(poster) : null;
  const stageRect = stage?.getBoundingClientRect();
  const video = document.querySelector(".aj-film__hero-video");
  return {
    bodyOverflow: document.documentElement.scrollWidth - innerWidth,
    objectFit: posterStyle?.objectFit,
    objectPosition: posterStyle?.objectPosition,
    stage: stageRect
      ? { height: stageRect.height, width: stageRect.width, x: stageRect.x, y: stageRect.y }
      : null,
    video: video
      ? { currentTime: video.currentTime, started: video.classList.contains("aj-film__hero-video--started") }
      : null,
  };
});
assert.equal(mobileHero.bodyOverflow, 0, "mobile page must not overflow horizontally");
assert.equal(mobileHero.objectFit, "contain", "mobile hero must preserve both models");
assert(mobileHero.stage?.width >= 525, "mobile film must be enlarged beyond the viewport");
assert(mobileHero.video?.started && mobileHero.video.currentTime > 0, "mobile hero video must autoplay");

const rail = mobile.page.locator('[data-home-horizontal-rail="v48"]');
await rail.scrollIntoViewIfNeeded();
await mobile.page.waitForTimeout(250);
await rail.locator("img").evaluateAll((images) => Promise.all(
  images.map((image) => image.decode().catch(() => undefined)),
));
await mobile.page.screenshot({
  path: fileURLToPath(new URL("mobile-slide-01.png", evidenceRoot)),
});

const railInitial = await rail.evaluate((node) => {
  const viewport = node.querySelector('[aria-label="Collection Apollon, trois coloris"]');
  const panels = [...node.querySelectorAll("article")];
  const images = [...node.querySelectorAll("img")];
  const style = getComputedStyle(node);
  const stage = node.firstElementChild?.getBoundingClientRect();
  return {
    borderTopWidth: style.borderTopWidth,
    imageFailures: images.filter((image) => !image.complete || image.naturalWidth === 0).length,
    panelCount: panels.length,
    scrollLeft: viewport?.scrollLeft ?? -1,
    scrollWidth: viewport?.scrollWidth ?? -1,
    stageHeight: stage?.height ?? -1,
    viewportWidth: viewport?.clientWidth ?? -1,
  };
});
assert.equal(railInitial.panelCount, 3, "the mobile rail must expose exactly three slides");
assert.equal(railInitial.borderTopWidth, "10px", "the mobile delimiter must be clearly visible");
assert.equal(railInitial.imageFailures, 0, "all six rail images must be decoded");
assert(railInitial.stageHeight <= 760, "mobile rail must not create a deep empty shelf");
assert.equal(railInitial.scrollWidth, railInitial.viewportWidth * 3, "mobile rail must span three exact viewports");

await swipeRail(mobile.page);
const afterFirstSwipe = await rail.locator('[aria-label="Collection Apollon, trois coloris"]').evaluate((node) => node.scrollLeft);
assert(afterFirstSwipe >= railInitial.viewportWidth * 0.85, "first finger swipe must reach slide two");
await mobile.page.screenshot({
  path: fileURLToPath(new URL("mobile-slide-02.png", evidenceRoot)),
});

await swipeRail(mobile.page);
const afterSecondSwipe = await rail.locator('[aria-label="Collection Apollon, trois coloris"]').evaluate((node) => node.scrollLeft);
assert(afterSecondSwipe >= railInitial.viewportWidth * 1.85, "second finger swipe must reach slide three");
await mobile.page.screenshot({
  path: fileURLToPath(new URL("mobile-slide-03.png", evidenceRoot)),
});
assert.deepEqual(mobile.errors, [], `mobile console errors: ${mobile.errors.join(" | ")}`);
await mobile.context.close();

const desktop = await openPage({ width: 1440, height: 900 });
await desktop.page.screenshot({
  path: fileURLToPath(new URL("desktop-hero.png", evidenceRoot)),
});
const desktopRail = desktop.page.locator('[data-home-horizontal-rail="v48"]');
const desktopRailTop = await desktopRail.evaluate((node) => node.offsetTop);
await desktop.page.evaluate((top) => window.scrollTo(0, Math.max(0, top - innerHeight + 180)), desktopRailTop);
await desktop.page.waitForTimeout(180);
await desktop.page.screenshot({
  path: fileURLToPath(new URL("desktop-divider.png", evidenceRoot)),
});
await desktopRail.scrollIntoViewIfNeeded();
await desktop.page.waitForTimeout(250);
await desktop.page.screenshot({
  path: fileURLToPath(new URL("desktop-divider-and-slide.png", evidenceRoot)),
});
const desktopState = await desktopRail.evaluate((node) => ({
  borderTopWidth: getComputedStyle(node).borderTopWidth,
  panelCount: node.querySelectorAll("article").length,
}));
assert(
  Number.parseFloat(desktopState.borderTopWidth) >= 9,
  "desktop delimiter must resolve to a clearly visible white band",
);
assert.equal(desktopState.panelCount, 3, "desktop rail must retain three panels");
assert.deepEqual(desktop.errors, [], `desktop console errors: ${desktop.errors.join(" | ")}`);
await desktop.context.close();

await browser.close();
process.stdout.write(`${JSON.stringify({ baseUrl, desktopState, mobileHero, railInitial }, null, 2)}\n`);
