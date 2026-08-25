import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseUrl = process.argv[2] ?? "http://localhost:3000/";
const evidenceDir = new URL(
  "../docs/internal/evidence/gauntlet-front-2026-08-24/",
  import.meta.url,
);
const round = "round-4";
const failures = [];
const results = {};

const [storeHeaderSource, storeChromeSource] = await Promise.all([
  readFile(new URL("../app/components/StoreHeader.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/components/StoreChrome.module.css", import.meta.url), "utf8"),
]);
assert(!storeHeaderSource.includes("stagger:"), "StoreHeader still contains menu stagger");
assert(!/duration:\s*(?:0\.[6-9]|[1-9])/.test(storeHeaderSource), "StoreHeader contains motion over 500ms");
assert(
  /\.fromTo\(\s*panneau,\s*\{\s*autoAlpha:\s*0\s*\},\s*\{\s*autoAlpha:\s*1,\s*duration:\s*0\.32/s.test(
    storeHeaderSource,
  ),
  "StoreHeader menu is not an opacity-only 320ms partition",
);
assert(/@media \(max-width: 760px\)/.test(storeChromeSource), "chrome does not switch to one row at zoom layout width");
assert(/\.menuSigne[\s\S]*?transition:\s*none/.test(storeChromeSource), "menu icon still has competing transition");
assert(
  /\.aj-home\.aj-home-v9[\s\S]*?transform:\s*none\s*!important/.test(storeChromeSource),
  "home chrome translation is not neutralized at the zoom layout breakpoint",
);

await mkdir(evidenceDir, { recursive: true });

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function findBrowserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_BROWSER_PATH,
    process.env.PROGRAMFILES &&
      `${process.env.PROGRAMFILES}/Microsoft/Edge/Application/msedge.exe`,
    process.env["PROGRAMFILES(X86)"] &&
      `${process.env["PROGRAMFILES(X86)"]}/Microsoft/Edge/Application/msedge.exe`,
    process.env.PROGRAMFILES &&
      `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,
    process.env["PROGRAMFILES(X86)"] &&
      `${process.env["PROGRAMFILES(X86)"]}/Google/Chrome/Application/chrome.exe`,
    process.env.LOCALAPPDATA &&
      `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/microsoft-edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);

  const bundled = chromium.executablePath();
  if (bundled) candidates.unshift(bundled);
  return candidates.find((candidate) => existsSync(candidate));
}

const executablePath = findBrowserExecutable();
if (!executablePath) {
  throw new Error(
    "No Chromium browser found. Install a Playwright browser or set PLAYWRIGHT_BROWSER_PATH.",
  );
}

const browser = await chromium.launch({ executablePath, headless: true });

async function waitForPage(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  for (const selector of [
    '[data-fd-id="section-hero"] img',
    '[data-fd-id="section-material"] img',
    '[data-fd-id="media-campaign-lilac"] img',
  ]) {
    await page.locator(selector).evaluate(async (image) => {
      if (!image.complete || image.naturalWidth === 0) {
        await new Promise((resolve, reject) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", reject, { once: true });
        });
      }
      await image.decode();
    });
  }
  await page.waitForTimeout(550);
}

async function inspect(name, viewport) {
  const context = await browser.newContext({
    locale: "fr-FR",
    reducedMotion: "no-preference",
    viewport,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__ajCls = 0;
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        if (!entry.hadRecentInput) window.__ajCls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await waitForPage(page);

  const metrics = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        bottom: rect.bottom,
        fontSize: style.fontSize,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      };
    };
    const parseColor = (value) => {
      const match = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return {
        r: match[0] ?? 0,
        g: match[1] ?? 0,
        b: match[2] ?? 0,
        a: match[3] ?? 1,
      };
    };
    const blend = (foreground, background) => ({
      r: foreground.r * foreground.a + background.r * (1 - foreground.a),
      g: foreground.g * foreground.a + background.g * (1 - foreground.a),
      b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    });
    const luminance = ({ r, g, b }) => {
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrast = (selector, background = "rgb(8, 8, 10)") => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const foreground = parseColor(getComputedStyle(element).color);
      const backdrop = parseColor(background);
      const composed = blend(foreground, backdrop);
      const lighter = Math.max(luminance(composed), luminance(backdrop));
      const darker = Math.min(luminance(composed), luminance(backdrop));
      return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
    };
    const heroImage = document.querySelector('[data-fd-id="section-hero"] img');
    const media = box('[data-fd-id="section-hero"] figure');
    const heroProductROI = (() => {
      if (!heroImage?.naturalWidth || !heroImage?.naturalHeight) return null;
      const source = { x1: 120, y1: 930, x2: 1555, y2: 2110 };
      const rect = heroImage.getBoundingClientRect();
      const style = getComputedStyle(heroImage);
      const tokens = style.objectPosition.trim().split(/\s+/);
      const positionFraction = (token, axis) => {
        if (token?.endsWith("%")) return Number.parseFloat(token) / 100;
        if (token === "left" || token === "top") return 0;
        if (token === "right" || token === "bottom") return 1;
        if (token === "center") return 0.5;
        return axis === "x" ? 0.5 : 0.5;
      };
      const positionX = positionFraction(tokens[0], "x");
      const positionY = positionFraction(tokens[1] ?? tokens[0], "y");
      const scale = Math.max(
        rect.width / heroImage.naturalWidth,
        rect.height / heroImage.naturalHeight,
      );
      const renderedWidth = heroImage.naturalWidth * scale;
      const renderedHeight = heroImage.naturalHeight * scale;
      const imageLeft = rect.left + (rect.width - renderedWidth) * positionX;
      const imageTop = rect.top + (rect.height - renderedHeight) * positionY;
      const projected = {
        left: imageLeft + source.x1 * scale,
        top: imageTop + source.y1 * scale,
        right: imageLeft + source.x2 * scale,
        bottom: imageTop + source.y2 * scale,
      };
      const intersection = {
        left: Math.max(rect.left, projected.left),
        top: Math.max(rect.top, projected.top),
        right: Math.min(rect.right, projected.right),
        bottom: Math.min(rect.bottom, projected.bottom),
      };
      const width = Math.max(0, intersection.right - intersection.left);
      const height = Math.max(0, intersection.bottom - intersection.top);
      return {
        area: Number((width * height).toFixed(2)),
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
        projected,
        intersection: { ...intersection, width, height },
        scale,
        source,
        viewportArea: innerWidth * innerHeight,
        viewportShare: Number(((width * height) / (innerWidth * innerHeight)).toFixed(4)),
      };
    })();
    const sectionBoxes = [...document.querySelectorAll("main > div > section")].map(
      (section) => {
        const rect = section.getBoundingClientRect();
        return {
          height: rect.height,
          id: section.getAttribute("data-fd-id") ?? section.className,
          viewports: Number((rect.height / innerHeight).toFixed(2)),
        };
      },
    );
    const heroCopy = getComputedStyle(
      document.querySelector('[data-fd-id="text-hero-title"]'),
    );
    const samplePixels = (image) => {
      if (!image?.naturalWidth) return null;
      const canvas = document.createElement("canvas");
      canvas.width = 16;
      canvas.height = 16;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, 16, 16);
      const pixels = context.getImageData(0, 0, 16, 16).data;
      let luminanceTotal = 0;
      let nonBlackPixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const luminance =
          0.2126 * pixels[index] +
          0.7152 * pixels[index + 1] +
          0.0722 * pixels[index + 2];
        luminanceTotal += luminance;
        if (luminance > 12) nonBlackPixels += 1;
      }
      return {
        averageLuminance: Number((luminanceTotal / 256).toFixed(2)),
        nonBlackRatio: Number((nonBlackPixels / 256).toFixed(3)),
      };
    };
    const campaignImage = document.querySelector(
      '[data-fd-id="media-campaign-lilac"] img',
    );
    const campaignPixels = samplePixels(campaignImage);
    const materialImage = document.querySelector('[data-fd-id="section-material"] img');
    return {
      campaign: campaignImage
        ? {
            box: box('[data-fd-id="media-campaign-lilac"] img'),
            currentSrc: campaignImage.currentSrc,
            naturalHeight: campaignImage.naturalHeight,
            naturalWidth: campaignImage.naturalWidth,
            opacity: getComputedStyle(campaignImage).opacity,
            pixels: campaignPixels,
          }
        : null,
      material: materialImage
        ? {
            box: box('[data-fd-id="section-material"] img'),
            currentSrc: materialImage.currentSrc,
            naturalHeight: materialImage.naturalHeight,
            naturalWidth: materialImage.naturalWidth,
            opacity: getComputedStyle(materialImage).opacity,
            pixels: samplePixels(materialImage),
          }
        : null,
      cls: window.__ajCls,
      contrast: {
        heroCta: contrast('[data-fd-id="btn-hero-apollon"]'),
        heroModel: contrast('[data-fd-id="offer-hero-apollon"] p'),
        inactiveTab: contrast('[role="tab"][aria-selected="false"]'),
        selectedTab: contrast('[role="tab"][aria-selected="true"]'),
      },
      cta: box('[data-fd-id="btn-hero-apollon"]'),
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        viewports: Number(
          (document.documentElement.scrollHeight / innerHeight).toFixed(2),
        ),
      },
      header: box("main > header"),
      hero: box('[data-fd-id="section-hero"]'),
      heroCopy: {
        animationName: heroCopy.animationName,
        opacity: heroCopy.opacity,
        visibility: heroCopy.visibility,
      },
      heroImage: heroImage
        ? {
            animationName: getComputedStyle(heroImage).animationName,
            currentSrc: heroImage.currentSrc,
            naturalHeight: heroImage.naturalHeight,
            naturalWidth: heroImage.naturalWidth,
          }
        : null,
      heroProductROI,
      heroMedia: media,
      initialColorway: {
        href: document.querySelector('[role="tabpanel"] a')?.getAttribute("href"),
        selected: document.querySelector('[role="tab"][aria-selected="true"]')?.id,
      },
      flow: {
        finalLabel: document.querySelector('[data-fd-id="section-campaign-closing"] p')?.textContent?.trim(),
        finalCopyBeforeMedia:
          box('[data-fd-id="section-campaign-closing"] > div')?.top <=
          box('[data-fd-id="media-campaign-lilac"]')?.top,
        materialCopyBeforeMedia:
          box('[data-fd-id="section-material"] > div')?.top <=
          box('[data-fd-id="section-material"] > figure')?.top,
        materialLabel: document.querySelector('[data-fd-id="section-material"] > div > p')?.textContent?.trim(),
      },
      sections: sectionBoxes,
      title: box('[data-fd-id="text-hero-title"]'),
      viewport: { height: innerHeight, width: innerWidth },
    };
  });

  const screenshotName = `${round}-home-${viewport.width}x${viewport.height}.png`;
  await page.screenshot({
    path: fileURLToPath(new URL(screenshotName, evidenceDir)),
    fullPage: false,
  });
  await page.screenshot({
    path: fileURLToPath(new URL(`${round}-hero-${name}.png`, evidenceDir)),
    fullPage: false,
  });

  await page.evaluate(() => window.scrollTo(0, innerHeight * 1.15));
  await page.waitForTimeout(250);
  const stickyHeader = await page.evaluate(() => {
    const header = document.querySelector("main > header");
    const rect = header.getBoundingClientRect();
    const style = getComputedStyle(header);
    return {
      backgroundColor: style.backgroundColor,
      opacity: style.opacity,
      position: style.position,
      top: rect.top,
    };
  });

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  const fullScreenshotName = `${round}-home-${viewport.width}x${viewport.height}-full.png`;
  await page.screenshot({
    path: fileURLToPath(new URL(fullScreenshotName, evidenceDir)),
    fullPage: true,
  });

  assert(consoleErrors.length === 0, `${name}: console errors: ${consoleErrors.join(" | ")}`);
  assert(pageErrors.length === 0, `${name}: page errors: ${pageErrors.join(" | ")}`);
  assert(metrics.cls <= 0.1, `${name}: CLS ${metrics.cls} exceeds 0.10`);
  assert(
    metrics.document.scrollWidth === metrics.document.clientWidth,
    `${name}: horizontal overflow ${metrics.document.scrollWidth - metrics.document.clientWidth}px`,
  );
  assert(
    metrics.heroImage?.currentSrc.endsWith("/images/client/raw/product-pourpre-detail.webp") &&
      metrics.heroImage?.naturalWidth === 1731 &&
      metrics.heroImage?.naturalHeight === 2600,
    `${name}: hero product source or natural size is invalid`,
  );
  assert(metrics.heroProductROI?.objectFit === "cover", `${name}: hero object-fit is not cover`);
  assert(
    metrics.heroProductROI?.viewportShare >= 0.25,
    `${name}: projected product ROI occupies ${metrics.heroProductROI?.viewportShare ?? 0} of viewport`,
  );
  assert(
    metrics.heroProductROI?.objectPosition === (name === "desktop" ? "50% 57%" : "50% 50%"),
    `${name}: hero object-position is ${metrics.heroProductROI?.objectPosition}`,
  );
  assert(metrics.cta?.height >= 44 && metrics.cta?.width >= 44, `${name}: CTA is under 44px`);
  assert(metrics.cta?.bottom <= viewport.height, `${name}: CTA falls below first viewport`);
  assert(metrics.header?.height <= (name === "desktop" ? 96 : 72), `${name}: header too tall`);
  assert(metrics.heroCopy.opacity === "1", `${name}: hero copy is not immediately opaque`);
  assert(metrics.heroCopy.visibility === "visible", `${name}: hero copy is hidden`);
  assert(metrics.heroCopy.animationName === "none", `${name}: hero copy still animates`);
  assert(
    metrics.campaign?.box?.width > 0 && metrics.campaign?.box?.height > 0,
    `${name}: campaign image has no visible box`,
  );
  assert(
    metrics.campaign?.naturalWidth > 0 && metrics.campaign?.naturalHeight > 0,
    `${name}: campaign image is not decoded`,
  );
  assert(metrics.campaign?.opacity === "1", `${name}: campaign image is transparent`);
  assert(
    metrics.campaign?.pixels?.nonBlackRatio >= 0.25 &&
      metrics.campaign?.pixels?.averageLuminance >= 18,
    `${name}: campaign image pixels are effectively black`,
  );
  assert(
    metrics.material?.currentSrc.endsWith("/images/client/raw/product-rose-detail.webp") &&
      metrics.material?.naturalWidth === 2000 &&
      metrics.material?.naturalHeight === 1331,
    `${name}: material macro source or natural size is invalid`,
  );
  assert(
    metrics.material?.box?.width > 0 && metrics.material?.box?.height > 0 &&
      metrics.material?.pixels?.nonBlackRatio >= 0.25 &&
      metrics.material?.pixels?.averageLuminance >= 18,
    `${name}: material macro is missing or effectively blank`,
  );
  assert(
    metrics.initialColorway.selected === "home-colorway-pourpre" &&
      metrics.initialColorway.href === "/products/pourpre",
    `${name}: initial colorway is not coherent with Pourpre hero`,
  );
  assert(
    Object.values(metrics.contrast).every((ratio) => ratio !== null && ratio >= 4.5),
    `${name}: representative text contrast is below WCAG AA`,
  );
  assert(stickyHeader.position === "sticky", `${name}: header is not sticky`);
  assert(stickyHeader.top === 0, `${name}: sticky header is not pinned at top`);
  assert(stickyHeader.backgroundColor === "rgb(8, 8, 10)", `${name}: header is not opaque black`);
  assert(stickyHeader.opacity === "1", `${name}: header is translucent`);
  if (name === "mobile") {
    assert(
      metrics.document.viewports >= 4.5 && metrics.document.viewports <= 5.15,
      `mobile: page length ${metrics.document.viewports} viewports is outside 4.5–5.15`,
    );
    assert(
      metrics.sections.every((section) => section.viewports <= 1.2),
      `mobile: section exceeds 1.2 viewports (${metrics.sections
        .filter((section) => section.viewports > 1.2)
        .map((section) => `${section.id}=${section.viewports}`)
        .join(", ")})`,
    );
    await page.locator('[data-fd-id="media-campaign-lilac"] img').scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: fileURLToPath(new URL(`${round}-campaign-mobile.png`, evidenceDir)),
      fullPage: false,
    });
    await page.locator('[data-fd-id="section-material"] img').scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await page.screenshot({
      path: fileURLToPath(new URL(`${round}-material-mobile.png`, evidenceDir)),
      fullPage: false,
    });
    assert(metrics.flow.materialCopyBeforeMedia, "mobile: material copy does not precede macro");
    assert(metrics.flow.finalCopyBeforeMedia, "mobile: closing copy does not precede campaign");
  }
  assert(metrics.flow.materialLabel === "Apollon · Rose Velours", `${name}: material color seam is missing`);
  assert(metrics.flow.finalLabel === "Apollon · Lilas Céleste", `${name}: final color seam is missing`);

  results[name] = {
    consoleErrors,
    fullScreenshot: fullScreenshotName,
    metrics,
    pageErrors,
    screenshot: screenshotName,
    stickyHeader,
  };
  await context.close();
}

await inspect("desktop", { width: 1440, height: 900 });
await inspect("mobile", { width: 390, height: 844 });

for (const [viewportName, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  const context = await browser.newContext({ locale: "fr-FR", viewport });
  const page = await context.newPage();
  await waitForPage(page);
  await page.locator('[data-fd-id="section-colorways"]').scrollIntoViewIfNeeded();
  const expected = {
    "rose-pale": { src: "editorial-rose-profile.webp", width: 1731, height: 2600, faceY: 0.18, waistY: 0.55 },
    "lilas-bleu-clair": { src: "editorial-lilas-chair.webp", width: 1731, height: 2600, faceY: 0.17, waistY: 0.56 },
    pourpre: { src: "editorial-pourpre-chair.webp", width: 1864, height: 2600, faceY: 0.18, waistY: 0.57 },
  };
  const collect = async (slug, method) => {
    const state = await page.evaluate(({ method, expected }) => {
      const image = document.querySelector('[data-fd-id="media-colorway-active"] img');
      const box = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      const durationMs = (value) => Math.max(
        ...value.split(",").map((token) => {
          const trimmed = token.trim();
          return Number.parseFloat(trimmed) * (trimmed.endsWith("ms") ? 1 : 1000);
        }),
      );
      const scale = Math.max(box.width / image.naturalWidth, box.height / image.naturalHeight);
      const renderedHeight = image.naturalHeight * scale;
      const overflowY = Math.max(0, renderedHeight - box.height);
      const positionToken = style.objectPosition.split(" ")[1] ?? "50%";
      const positionY = Number.parseFloat(positionToken) / 100;
      const visibleTop = (overflowY * positionY) / scale;
      const visibleBottom = visibleTop + box.height / scale;
      const faceY = expected.faceY * image.naturalHeight;
      const waistY = expected.waistY * image.naturalHeight;
      return {
        box: { height: box.height, width: box.width },
        currentSrc: image.currentSrc,
        crop: { faceVisible: faceY >= visibleTop && faceY <= visibleBottom, visibleBottom, visibleTop, waistVisible: waistY >= visibleTop && waistY <= visibleBottom },
        method,
        naturalHeight: image.naturalHeight,
        naturalWidth: image.naturalWidth,
        selected: document.querySelector('[role="tab"][aria-selected="true"]')?.id,
        animationDuration: style.animationDuration,
        animationMs: durationMs(style.animationDuration),
        transitionDuration: style.transitionDuration,
        transitionMs: durationMs(style.transitionDuration),
      };
    }, { method, expected: expected[slug] });
    assert(state.selected === `home-colorway-${slug}`, `${viewportName}/${method}: ${slug} not selected`);
    assert(state.currentSrc.endsWith(expected[slug].src), `${viewportName}/${method}: ${slug} wrong currentSrc`);
    assert(state.naturalWidth === expected[slug].width && state.naturalHeight === expected[slug].height, `${viewportName}/${method}: ${slug} natural size mismatch`);
    assert(state.crop.faceVisible && state.crop.waistVisible, `${viewportName}/${method}: ${slug} face or waistband outside crop`);
    assert(state.box.width > 0 && state.box.height > 0, `${viewportName}/${method}: ${slug} image has no box`);
    const effectiveMotionMs = Math.max(state.animationMs, state.transitionMs);
    assert(
      effectiveMotionMs >= 180 && effectiveMotionMs <= 500,
      `${viewportName}/${method}: ${slug} motion is ${effectiveMotionMs}ms, outside 180–500ms`,
    );
    state.effectiveMotionMs = effectiveMotionMs;
    return state;
  };
  const mouse = [];
  for (const slug of ["rose-pale", "lilas-bleu-clair", "pourpre"]) {
    await page.locator(`#home-colorway-${slug}`).click();
    await page.waitForTimeout(420);
    mouse.push(await collect(slug, "mouse"));
  }
  const keyboard = [];
  for (const [key, slug] of [["Home", "rose-pale"], ["ArrowRight", "lilas-bleu-clair"], ["End", "pourpre"]]) {
    await page.getByRole("tab", { selected: true }).press(key);
    await page.waitForTimeout(420);
    keyboard.push(await collect(slug, "keyboard"));
    await page.locator('[data-fd-id="media-colorway-active"] img').screenshot({
      path: fileURLToPath(new URL(`${round}-colorway-${viewportName}-${slug}.png`, evidenceDir)),
    });
  }
  results[`colorways-${viewportName}`] = { keyboard, mouse };
  await context.close();
}

{
  const context = await browser.newContext({ locale: "fr-FR", viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await waitForPage(page);
  const states = [];
  const selected = page.getByRole("tab", { selected: true });
  await selected.scrollIntoViewIfNeeded();
  await selected.focus();
  const focus = await selected.evaluate((tab) => {
    const style = getComputedStyle(tab);
    const selectedLine = getComputedStyle(tab, "::after");
    return {
      boxShadow: style.boxShadow,
      outlineColor: style.outlineColor,
      outlineOffset: Number.parseFloat(style.outlineOffset),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      selectedIndicatorColor: selectedLine.backgroundColor,
    };
  });
  await page.screenshot({
    path: fileURLToPath(new URL(`${round}-focus-390x844.png`, evidenceDir)),
    fullPage: false,
  });

  for (const [key, expectedId, expectedHref] of [
    ["Home", "home-colorway-rose-pale", "/products/rose-pale"],
    ["ArrowRight", "home-colorway-lilas-bleu-clair", "/products/lilas-bleu-clair"],
    ["End", "home-colorway-pourpre", "/products/pourpre"],
  ]) {
    await page.getByRole("tab", { selected: true }).press(key);
    await page.waitForTimeout(100);
    states.push(
      await page.evaluate(() => ({
        activeElement: document.activeElement?.id,
        href: document.querySelector('[role="tabpanel"] a')?.getAttribute("href"),
        selected: document.querySelector('[role="tab"][aria-selected="true"]')?.id,
      })),
    );
    const current = states.at(-1);
    assert(
      current.activeElement === expectedId && current.selected === expectedId && current.href === expectedHref,
      `colorway ${key}: focus/ARIA/URL mismatch`,
    );
  }
  assert(focus.outlineWidth >= 2, "tab focus outline is under 2px");
  assert(focus.outlineOffset >= 2, "tab focus outline is not external");
  assert(focus.outlineStyle !== "none", "tab focus outline is invisible");
  assert(focus.outlineColor !== focus.selectedIndicatorColor, "tab focus is not distinct from selected state");

  const menuButton = page.getByRole("button", { name: "Navigation principale" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await menuButton.focus();
  const openedAt = Date.now();
  await menuButton.click();
  await page.waitForFunction(() => {
    const panel = document.querySelector('header [id][style*="visibility"]');
    return panel && Number.parseFloat(getComputedStyle(panel).opacity) >= 0.99;
  });
  const menuOpenMs = Date.now() - openedAt;
  const menuOpen = await page.evaluate(() => {
    const header = document.querySelector("main > header");
    const targets = [...header.querySelectorAll("button + div a, button + div select")].map((target) => {
      const rect = target.getBoundingClientRect();
      return {
        height: rect.height,
        tag: target.tagName,
        text: target.textContent.trim(),
        transform: getComputedStyle(target).transform,
        width: rect.width,
      };
    });
    const button = header.querySelector("button");
    const buttonRect = button.getBoundingClientRect();
    return {
      expanded: header.querySelector("button")?.getAttribute("aria-expanded"),
      iconTransition: getComputedStyle(header.querySelector("button span")).transitionDuration,
      button: { height: buttonRect.height, width: buttonRect.width },
      targets,
      menu: header.getAttribute("data-menu"),
      panel: {
        opacity: getComputedStyle(header.querySelector("button + div")).opacity,
        transform: getComputedStyle(header.querySelector("button + div")).transform,
        transitionDuration: getComputedStyle(header.querySelector("button + div")).transitionDuration,
      },
    };
  });
  assert(menuOpen.expanded === "true" && menuOpen.menu === "ouvert", "mobile menu did not open");
  assert(menuOpen.targets.length >= 6, "mobile menu does not expose all navigation targets");
  assert(
    menuOpen.targets.every((target) => target.height >= 44 && target.width >= 44) &&
      menuOpen.button.height >= 44 && menuOpen.button.width >= 44,
    "mobile menu has a target under 44×44px",
  );
  assert(menuOpenMs <= 500, `mobile menu partition took ${menuOpenMs}ms`);
  assert(menuOpen.panel.transform === "none", "menu panel has competing transform motion");
  assert(menuOpen.iconTransition === "0s", "menu icon has competing motion");
  assert(menuOpen.targets.every((target) => target.transform === "none"), "menu targets have competing transforms");
  await page.keyboard.press("Tab");
  const firstTabTarget = await page.evaluate(() => document.activeElement?.textContent?.trim());
  assert(firstTabTarget === "Accueil", `menu focus order starts on ${firstTabTarget}`);
  await page.keyboard.press("Escape");
  assert((await menuButton.getAttribute("aria-expanded")) === "false", "Escape did not close menu");
  assert(await menuButton.evaluate((button) => button === document.activeElement), "Escape did not restore menu button focus");
  results.interactions = { colorways: states, focus, menuOpen, menuOpenMs, firstTabTarget };
  await context.close();
}

{
  const context = await browser.newContext({
    locale: "fr-FR",
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await waitForPage(page);
  const reducedMotion = await page.evaluate(() => {
    const heroImage = getComputedStyle(document.querySelector('[data-fd-id="section-hero"] img'));
    const heroCopy = getComputedStyle(document.querySelector('[data-fd-id="text-hero-title"]'));
    const tab = getComputedStyle(document.querySelector('[role="tab"]'));
    return {
      heroCopyAnimation: heroCopy.animationName,
      heroImageAnimation: heroImage.animationName,
      prefersReduce: matchMedia("(prefers-reduced-motion: reduce)").matches,
      tabTransitionDuration: tab.transitionDuration,
    };
  });
  assert(reducedMotion.prefersReduce, "reduced motion preference is not active");
  assert(reducedMotion.heroCopyAnimation === "none", "hero copy animates in reduced motion");
  assert(reducedMotion.heroImageAnimation === "none", "hero image animates in reduced motion");
  assert(
    reducedMotion.tabTransitionDuration === "0s" || reducedMotion.tabTransitionDuration === "1e-05s",
    "tab transition remains active in reduced motion",
  );
  results.reducedMotion = reducedMotion;
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await waitForPage(page);
  await page.locator('[data-fd-id="btn-hero-apollon"]').click();
  await page.waitForURL(/\/products\/pourpre$/);
  results.ctaNavigation = { destination: new URL(page.url()).pathname };
  assert(results.ctaNavigation.destination === "/products/pourpre", "hero CTA destination failed");
  await context.close();
}

await browser.close();

{
  const zoomBrowser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--force-device-scale-factor=2", "--window-size=746,543"],
  });
  const context = await zoomBrowser.newContext({ locale: "fr-FR", viewport: null });
  const page = await context.newPage();
  await waitForPage(page);
  const zoomStates = [];
  for (const [state, selector] of [
    ["start", '[data-fd-id="section-hero"]'],
    ["mid", '[data-fd-id="section-material"]'],
    ["end", '[data-fd-id="section-campaign-closing"]'],
  ]) {
    const target = page.locator(selector);
    if (state !== "start") {
      await target.evaluate((element) =>
        element.scrollIntoView({ behavior: "instant", block: "start" }),
      );
    }
    else await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(120);
    await page.getByRole("button", { name: "Navigation principale" }).focus();
    const geometry = await page.evaluate((selector) => {
      const headerElement = document.querySelector("main > header");
      const header = headerElement.getBoundingClientRect();
      const target = document.querySelector(selector).getBoundingClientRect();
      const brand = headerElement.querySelector("a").getBoundingClientRect();
      const menu = headerElement.querySelector("button").getBoundingClientRect();
      const focus = document.activeElement.getBoundingClientRect();
      const rect = (value) => ({
        bottom: value.bottom,
        height: value.height,
        left: value.left,
        right: value.right,
        top: value.top,
        width: value.width,
      });
      return {
        brand: rect(brand),
        focus: rect(focus),
        header: rect(header),
        headerTransform: getComputedStyle(headerElement).transform,
        menu: rect(menu),
        targetBottom: target.bottom,
        targetTop: target.top,
        viewport: { height: innerHeight, width: innerWidth },
      };
    }, selector);
    const occluded =
      geometry.targetTop < geometry.header.bottom - 1 && geometry.targetBottom > 0;
    assert(!occluded, `zoom layout ${state}: target is occluded by sticky header`);
    assert(geometry.header.top === 0, `zoom layout ${state}: header top is ${geometry.header.top}`);
    assert(
      geometry.header.bottom <= geometry.viewport.height,
      `zoom layout ${state}: header leaves viewport`,
    );
    for (const key of ["brand", "menu", "focus"]) {
      const rect = geometry[key];
      assert(
        rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= geometry.viewport.height &&
          rect.right <= geometry.viewport.width,
        `zoom layout ${state}: ${key} is not fully inside viewport`,
      );
    }
    assert(
      geometry.headerTransform === "none",
      `zoom layout ${state}: header transform is ${geometry.headerTransform}`,
    );
    await page.screenshot({
      path: fileURLToPath(new URL(`${round}-zoom-layout-200-${state}.png`, evidenceDir)),
      fullPage: false,
      scale: "device",
    });
    zoomStates.push({ geometry, occluded, selector, state });
  }
  const selected = page.getByRole("tab", { selected: true });
  await selected.scrollIntoViewIfNeeded();
  await selected.focus();
  await page.keyboard.press("Tab");
  const tabFocusVisible = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    const rect = document.activeElement.getBoundingClientRect();
    const header = document.querySelector("main > header").getBoundingClientRect();
    return {
      element: document.activeElement?.textContent?.trim(),
      occluded: rect.top < header.bottom && rect.bottom > 0,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  assert(!tabFocusVisible.occluded, "zoom layout tab focus is hidden by sticky header");
  const zoom = await page.evaluate(() => {
    return {
      clientWidth: document.documentElement.clientWidth,
      devicePixelRatio,
      horizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      innerHeight,
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      visualViewportScale: visualViewport?.scale ?? null,
    };
  });
  assert(zoom.devicePixelRatio === 2, `zoom layout DPR is ${zoom.devicePixelRatio}, not 2`);
  assert(zoom.innerWidth === 720, `zoom layout viewport width is ${zoom.innerWidth}, expected 720`);
  assert(zoom.horizontalOverflow === 0, `zoom layout overflow is ${zoom.horizontalOverflow}px`);
  results.zoomLayout200 = {
    kind: "layout emulation at 200%; not claimed as browser UI zoom",
    states: zoomStates,
    tabFocusVisible,
    ...zoom,
  };
  await zoomBrowser.close();
}

results.browser = { executablePath, playwright: "playwright-core project dependency" };
results.failures = failures;
await writeFile(
  new URL(`${round}-browser-metrics.json`, evidenceDir),
  `${JSON.stringify(results, null, 2)}\n`,
);

if (failures.length) {
  console.error(JSON.stringify(results, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(results, null, 2));
}
