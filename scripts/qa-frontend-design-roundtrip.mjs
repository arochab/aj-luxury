import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const previewUrl = new URL(
  "../.frontend-design/aj-luxury-home/2026-08-24-photo-only-gauntlet.html",
  import.meta.url,
);
const evidenceUrl = new URL(
  "../docs/internal/evidence/gauntlet-front-2026-08-24/",
  import.meta.url,
);
const previewSource = await readFile(previewUrl, "utf8");
const embeddedFallbackCount =
  previewSource.match(/class="fallback" src="data:image\/png;base64,/g)?.length ?? 0;

function findBrowserExecutable() {
  const programFiles = process.env.ProgramFiles ?? "C:/Program Files";
  const programFilesX86 =
    process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    process.env.PLAYWRIGHT_BROWSER_PATH,
    chromium.executablePath(),
    `${programFilesX86}/Microsoft/Edge/Application/msedge.exe`,
    `${programFiles}/Microsoft/Edge/Application/msedge.exe`,
    localAppData &&
      `${localAppData}/Microsoft/Edge/Application/msedge.exe`,
    `${programFiles}/Google/Chrome/Application/chrome.exe`,
    localAppData &&
      `${localAppData}/Google/Chrome/Application/chrome.exe`,
    "/usr/bin/microsoft-edge",
    "/usr/bin/google-chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error(
      "No Chromium browser found. Install the project Playwright browser or set PLAYWRIGHT_BROWSER_PATH.",
    );
  }
  return executable;
}

const sourceChecks = {
  actualIframes:
    previewSource.includes('src="http://localhost:3000/?frontend-design=round-4&viewport=desktop"') &&
    previewSource.includes('src="http://localhost:3000/?frontend-design=round-4&viewport=mobile"'),
  explicitFallback:
    previewSource.includes("FALLBACK · capture QA réelle") &&
    embeddedFallbackCount === 2 &&
    !previewSource.includes("../../docs/internal/evidence/"),
  honestMode: previewSource.includes("const PREVIEW_MODE = 'real localhost iframes with explicit real-screenshot fallback'"),
  noManifesto: !previewSource.includes('data-fd-id="section-manifesto"'),
  noFacsimile: !/aj-stage|aj-product|PREVIEW_DERIVATION/.test(previewSource),
  noRemoteResources: !/(?:src|href)=["']https?:\/\/(?!localhost:3000)/i.test(previewSource),
  noSampleUi: !/Analytics Dashboard|Revenue Overview|Sign in|Sample UI/i.test(
    previewSource,
  ),
  stableFrames:
    previewSource.includes('data-fd-id="frame-live-desktop"') &&
    previewSource.includes('data-fd-id="frame-live-mobile"'),
  targetFile: previewSource.includes(
    "targetFile: 'scripts/build-aj-home-frontend-preview.mjs'",
  ),
};

const browser = await chromium.launch({
  executablePath: findBrowserExecutable(),
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));

await page.goto(previewUrl.href, { waitUntil: "load" });
await page.waitForTimeout(900);

const liveStates = await page.locator(".live-frame").evaluateAll((frames) =>
  frames.map((frame) => ({ state: frame.dataset.liveState, badge: frame.querySelector(".mode-badge")?.textContent })),
);

const brokenImages = await page.locator(".preview img").evaluateAll((images) =>
  images
    .filter((image) => !image.complete || image.naturalWidth === 0)
    .map((image) => image.getAttribute("src")),
);

const heroSplit = page.locator(
  '.control-row[data-var-key="--preview-frame-inset"] input[type="range"]',
);
await heroSplit.evaluate((slider) => {
  slider.value = "16";
  slider.dispatchEvent(new Event("input", { bubbles: true }));
});
const appliedHeroSplit = await page.locator(".preview").evaluateAll((panes) =>
  panes.map((pane) => pane.style.getPropertyValue("--preview-frame-inset")),
);

const heroTitle = page.locator(
  '#preview-light [data-fd-id="preview-mode-title"][data-fd-editable="text"]',
);
await heroTitle.evaluate((element) => {
  element.textContent = "Accueil AJ Luxury — artefact réel contrôlé";
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
});
const mirroredTitles = await page
  .locator('[data-fd-id="preview-mode-title"][data-fd-editable="text"]')
  .allInnerTexts();

await page.locator("#comment-mode-btn").click();
await page.locator('#preview-light [data-fd-id="frame-live-desktop"]').click({ position: { x: 8, y: 8 } });
await page
  .locator("#pop-textarea")
  .fill("Conserver une cible commerciale de 44 px minimum.");
await page.locator("#pop-save").click();

await page.locator("#export-btn").click();
await page.locator("#export-modal.open").waitFor();
const markdown = await page.locator("#export-pre").innerText();
const exportChecks = {
  apply: markdown.includes("### Apply"),
  comment: markdown.includes("Conserver une cible commerciale de 44 px minimum."),
  decisions:
    markdown.includes("### Decisions") &&
    markdown.includes(`\`--preview-frame-inset\` → \`16px\``),
  directEdit:
    markdown.includes("### Direct edits") && markdown.includes("artefact réel contrôlé"),
  elementComments:
    markdown.includes("### Element comments") &&
    markdown.includes("frame-live-desktop"),
  source: markdown.includes(
    "Source: .frontend-design/aj-luxury-home/2026-08-24-photo-only-gauntlet.html",
  ),
};

await page.screenshot({
  path: fileURLToPath(new URL("round-4-frontend-design.png", evidenceUrl)),
  fullPage: false,
});

const fallbackContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await fallbackContext.route("http://localhost:3000/**", (route) => route.abort());
const fallbackPage = await fallbackContext.newPage();
await fallbackPage.goto(previewUrl.href, { waitUntil: "load" });
await fallbackPage.waitForTimeout(2400);
const fallbackStates = await fallbackPage.locator(".live-frame").evaluateAll((frames) =>
  frames.map((frame) => ({
    state: frame.dataset.liveState,
    badge: frame.querySelector(".mode-badge")?.textContent,
    fallbackVisible: getComputedStyle(frame.querySelector(".fallback")).display !== "none",
  })),
);
await fallbackContext.close();

const result = {
  appliedHeroSplit,
  brokenImages,
  consoleErrors,
  exportChecks,
  mirroredTitles,
  pageErrors,
  liveStates,
  fallbackStates,
  sourceChecks,
};
await writeFile(
  new URL("round-4-frontend-design-qa.json", evidenceUrl),
  `${JSON.stringify(result, null, 2)}\n`,
);
await browser.close();

const failed = [
  ...Object.entries(sourceChecks).filter(([, passed]) => !passed),
  ...Object.entries(exportChecks).filter(([, passed]) => !passed),
];
if (
  failed.length ||
  brokenImages.length ||
  consoleErrors.length ||
  pageErrors.length ||
  liveStates.some(({ state }) => state !== "live") ||
  fallbackStates.some(({ state, fallbackVisible }) => state !== "fallback" || !fallbackVisible) ||
  appliedHeroSplit.some((value) => value !== "16px") ||
  mirroredTitles.some((value) => !value.includes("artefact réel contrôlé"))
) {
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(result, null, 2));
}
