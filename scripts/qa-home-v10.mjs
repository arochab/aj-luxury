import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = new URL("../artifacts/gauntlet-round2/", import.meta.url);
await mkdir(root, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

const reports = [];

async function capture(name, viewport, reducedMotion = "no-preference") {
  const page = await browser.newPage({ viewport, reducedMotion });
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("http://localhost:3000/", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.evaluate(() => Promise.race([
    document.fonts.ready,
    new Promise((resolve) => window.setTimeout(resolve, 5_000)),
  ]));
  await page.locator("#collection").scrollIntoViewIfNeeded();
  await page.locator("[data-motion='collection-card'] img").evaluateAll((images) =>
    Promise.race([
      Promise.all(images.map((image) => image.decode().catch(() => undefined))),
      new Promise((resolve) => window.setTimeout(resolve, 5_000)),
    ]),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);

  const measure = async () => page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    classesWithUndefined: [...document.querySelectorAll("[class]")]
      .filter((node) => node.getAttribute("class")?.includes("undefined")).length,
    videoCount: document.querySelectorAll("video").length,
    sections: [...document.querySelectorAll("main section")].map((section) => ({
      id: section.id,
      top: Math.round(section.getBoundingClientRect().top + window.scrollY),
      height: Math.round(section.getBoundingClientRect().height),
    })),
  }));

  await page.screenshot({ path: fileURLToPath(new URL(`${name}-hero.png`, root)) });

  if (viewport.width > 760 && reducedMotion === "no-preference") {
    const stage = page.locator("[data-motion='collection-stage']");
    const box = await stage.boundingBox();
    if (box) {
      const travel = box.height - viewport.height;
      for (const [index, progress] of [0.12, 0.5, 0.88].entries()) {
        await page.evaluate((y) => window.scrollTo(0, y), box.y + travel * progress);
        await page.waitForTimeout(120);
        await page.screenshot({ path: fileURLToPath(new URL(`${name}-product-${index + 1}.png`, root)) });
      }
    }
  } else {
    await page.locator("#collection").scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}-collection.png`, root)) });
  }

  await page.locator("#histoire").scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  await page.screenshot({ path: fileURLToPath(new URL(`${name}-story.png`, root)) });

  reports.push({ name, viewport, reducedMotion, errors, ...(await measure()) });
  await page.close();
}

await capture("desktop", { width: 1440, height: 900 });
await capture("mobile", { width: 390, height: 844 });
await capture("reduced", { width: 1440, height: 900 }, "reduce");

await browser.close();
process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
