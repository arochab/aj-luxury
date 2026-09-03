import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseUrl = process.env.AJ_QA_URL ?? "http://127.0.0.1:3035/";
const isBindinglessLocalQa = ["127.0.0.1", "localhost"].includes(
  new URL(baseUrl).hostname,
);
const evidenceRoot = new URL(
  "../docs/internal/evidence/prelaunch-2026-09-03/",
  import.meta.url,
);
await mkdir(evidenceRoot, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

async function readyPage(viewport, hasTouch = false, pathname = "/") {
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
  await page.goto(new URL(pathname, baseUrl).href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
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
  const mobileHero = await run.page.locator(".aj-film__hero-stage").evaluate((stage) => {
    const rect = stage.getBoundingClientRect();
    const poster = stage.querySelector(".aj-film__hero-poster img");
    return {
      left: rect.left,
      right: innerWidth - rect.right,
      objectFit: poster ? getComputedStyle(poster).objectFit : null,
      imageReady: Boolean(poster?.complete && poster.naturalWidth > 0),
    };
  });
  assert(mobileHero.left >= -1 && mobileHero.right >= -1, `${viewport.width}px: hero stays inside viewport`);
  assert.equal(
    mobileHero.objectFit,
    "cover",
    `${viewport.width}px: approved portrait master fills the mobile hero`,
  );
  assert.equal(mobileHero.imageReady, true, `${viewport.width}px: hero poster decodes`);
  const heroScreenshot = fileURLToPath(
    new URL(`mobile-${viewport.width}-hero.png`, evidenceRoot),
  );
  await run.page.screenshot({ path: heroScreenshot });
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
    /apollon-pourpre-model-color-v2/,
  );
  assert(
    result.railScrollWidth >= result.railClientWidth * 3 &&
      result.railScrollWidth <= result.railClientWidth * 3 + 120,
    `${viewport.width}px: three full panels plus the two designed transitions`,
  );

  const railScreenshot = fileURLToPath(new URL(`mobile-${viewport.width}.png`, evidenceRoot));
  await run.page.screenshot({ path: railScreenshot });
  mobileResults.push({
    viewport,
    hero: mobileHero,
    ...result,
    screenshots: { hero: heroScreenshot, rail: railScreenshot },
  });
  assert.deepEqual(run.errors, [], `${viewport.width}px console errors`);
  await run.context.close();
}

const desktop = await readyPage({ width: 1440, height: 900 });
const heroSafety = await desktop.page.locator(".aj-film__hero-stage").evaluate((stage) => {
  const rect = stage.getBoundingClientRect();
  const poster = stage.querySelector(".aj-film__hero-poster img");
  return {
    left: rect.left,
    right: innerWidth - rect.right,
    top: rect.top,
    objectFit: poster ? getComputedStyle(poster).objectFit : null,
    imageReady: Boolean(poster?.complete && poster.naturalWidth > 0),
  };
});
assert(heroSafety.left >= 10, "desktop hero keeps a left optical safety inset");
assert(heroSafety.right >= 10, "desktop hero keeps Alex inside the right source edge");
assert.equal(heroSafety.objectFit, "contain", "desktop hero never crops the film");
assert.equal(heroSafety.imageReady, true, "desktop hero poster decodes");
const heroScreenshot = fileURLToPath(new URL("desktop-hero-1440.png", evidenceRoot));
await desktop.page.screenshot({ path: heroScreenshot });
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

const story = await readyPage({ width: 1440, height: 900 }, false, "/notre-histoire");
const storyHero = await story.page.locator("figure").first().evaluate((figure) => {
  const images = [...figure.querySelectorAll("img")];
  return {
    backgroundColor: getComputedStyle(figure).backgroundColor,
    count: images.length,
    fits: images.map((image) => getComputedStyle(image).objectFit),
    ready: images.every((image) => image.complete && image.naturalWidth > 0),
  };
});
assert.deepEqual(storyHero.fits, ["contain"]);
assert.equal(storyHero.count, 1, "story hero renders the intact campaign image once");
assert.equal(storyHero.backgroundColor, "rgb(255, 255, 255)", "story hero has no dark side bands");
assert.equal(storyHero.ready, true, "story hero images decode");
assert.deepEqual(story.errors, [], "story has no browser errors");
const storyScreenshot = fileURLToPath(new URL("story-desktop-1440.png", evidenceRoot));
await story.page.screenshot({ path: storyScreenshot });
await story.context.close();

const mobileStory = await readyPage({ width: 390, height: 844 }, true, "/notre-histoire");
const mobileStoryHero = await mobileStory.page.locator("figure").first().evaluate((figure) => {
  const images = [...figure.querySelectorAll("img")];
  return {
    backgroundColor: getComputedStyle(figure).backgroundColor,
    count: images.length,
    fits: images.map((image) => getComputedStyle(image).objectFit),
    ready: images.every((image) => image.complete && image.naturalWidth > 0),
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
});
assert.deepEqual(mobileStoryHero.fits, ["contain"]);
assert.equal(mobileStoryHero.count, 1, "mobile story renders the intact campaign image once");
assert.equal(mobileStoryHero.backgroundColor, "rgb(255, 255, 255)", "mobile story has no dark side bands");
assert.equal(mobileStoryHero.ready, true, "mobile story images decode");
assert.equal(mobileStoryHero.overflow, 0, "mobile story does not overflow horizontally");
assert.deepEqual(mobileStory.errors, [], "mobile story has no browser errors");
const mobileStoryScreenshot = fileURLToPath(new URL("story-mobile-390.png", evidenceRoot));
await mobileStory.page.screenshot({ path: mobileStoryScreenshot });
await mobileStory.context.close();

const account = await readyPage({ width: 1440, height: 900 }, false, "/account");
await account.page.waitForTimeout(700);
const accountState = {
  alerts: await account.page.locator('[role="alert"]').count(),
  adminHref: await account.page
    .getByRole("link", { name: "Ouvrir l’administration" })
    .getAttribute("href"),
  heading: await account.page.locator("h1").first().textContent(),
};
assert.equal(accountState.alerts, 0, "account bootstrap shows no false outage alert");
assert.equal(accountState.adminHref, "/admin", "account exposes the protected admin entry");
assert.match(accountState.heading ?? "", /Se connecter|Mon compte/);
assert(
  account.errors.every(
    (message) => isBindinglessLocalQa && message.includes("404"),
  ),
  "account has no unexpected browser errors",
);
const accountScreenshot = fileURLToPath(new URL("account-desktop-1440.png", evidenceRoot));
await account.page.screenshot({ path: accountScreenshot });
await account.context.close();

const admin = await readyPage({ width: 1440, height: 900 }, false, "/admin");
const adminState = {
  heading: await admin.page.locator("h1").textContent(),
  signIn: await admin.page.getByRole("heading", { name: "Se connecter" }).count(),
  dashboard: await admin.page
    .getByRole("table", { name: "Commandes payées et expéditions" })
    .count(),
};
assert.equal(adminState.heading, "Administration AJ Luxury");
assert.equal(adminState.dashboard, 0, "anonymous admin route never exposes the dashboard");
if (isBindinglessLocalQa) {
  assert.equal(adminState.dashboard, 0, "local admin route remains closed without Cloudflare bindings");
} else {
  assert.equal(adminState.signIn, 1, "anonymous admin route stays behind sign-in");
  assert.deepEqual(admin.errors, [], "admin sign-in has no browser errors");
}
const adminScreenshot = fileURLToPath(new URL("admin-desktop-1440.png", evidenceRoot));
await admin.page.screenshot({ path: adminScreenshot });
await admin.context.close();
await browser.close();

const evidence = {
  baseUrl,
  generatedAt: new Date().toISOString(),
  mobile: mobileResults,
  desktop: {
    heroSafety,
    beforeWheel,
    wheelPrevented,
    afterWheel,
    screenshots: {
      hero: heroScreenshot,
      rail: desktopScreenshot,
      story: storyScreenshot,
      mobileStory: mobileStoryScreenshot,
      account: accountScreenshot,
      admin: adminScreenshot,
    },
  },
};
await writeFile(
  new URL("ui-verification.json", evidenceRoot),
  `${JSON.stringify(evidence, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
