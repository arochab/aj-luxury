import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

async function runDesktop() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_500);
  await page.keyboard.press("Tab");
  const firstFocus = await page.evaluate(() => ({
    href: document.activeElement?.getAttribute("href"),
    text: document.activeElement?.textContent?.trim(),
  }));

  const steps = page.locator("[data-motion='collection-step']");
  await steps.nth(1).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2_500);
  const rose = await page.evaluate(() => ({
    active: [...document.querySelectorAll("[data-motion='collection-step']")]
      .map((step) => step.getAttribute("aria-pressed")),
    scrollY: Math.round(window.scrollY),
    focused: document.activeElement?.getAttribute("aria-label"),
  }));

  await steps.nth(2).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2_500);
  const lilas = await page.evaluate(() => ({
    active: [...document.querySelectorAll("[data-motion='collection-step']")]
      .map((step) => step.getAttribute("aria-pressed")),
    scrollY: Math.round(window.scrollY),
    focused: document.activeElement?.getAttribute("aria-label"),
  }));
  await page.close();
  return { firstFocus, rose, lilas };
}

async function runMobile() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_500);
  const steps = page.locator("[data-motion='collection-step']");
  await steps.nth(1).click();
  await page.waitForTimeout(2_500);
  const clickState = await page.evaluate(() => ({
    railLeft: Math.round(document.querySelector("[data-motion='product-rail']")?.scrollLeft ?? 0),
    active: [...document.querySelectorAll("[data-motion='collection-step']")]
      .map((step) => step.getAttribute("aria-pressed")),
  }));

  await page.evaluate(() => {
    const rail = document.querySelector("[data-motion='product-rail']");
    const card = document.querySelectorAll("[data-motion='collection-card']")[2];
    if (rail instanceof HTMLElement && card instanceof HTMLElement) {
      rail.scrollTo({ left: card.offsetLeft - 16, behavior: "auto" });
    }
  });
  await page.waitForTimeout(500);
  const swipeState = await page.evaluate(() => ({
    railLeft: Math.round(document.querySelector("[data-motion='product-rail']")?.scrollLeft ?? 0),
    active: [...document.querySelectorAll("[data-motion='collection-step']")]
      .map((step) => step.getAttribute("aria-pressed")),
  }));
  await page.close();
  return { clickState, swipeState };
}

const report = {
  desktop: await runDesktop(),
  mobile: await runMobile(),
};

await browser.close();
assert.deepEqual(report.desktop.firstFocus, {
  href: "#apollon",
  text: "Aller au contenu principal",
});
assert.deepEqual(report.desktop.rose.active, ["false", "true", "false"]);
assert.equal(report.desktop.rose.focused, "Rose Velours");
assert.deepEqual(report.desktop.lilas.active, ["false", "false", "true"]);
assert.equal(report.desktop.lilas.focused, "Lilas Céleste");
assert.ok(report.mobile.clickState.railLeft > 200);
assert.deepEqual(report.mobile.clickState.active, ["false", "true", "false"]);
assert.ok(report.mobile.swipeState.railLeft > report.mobile.clickState.railLeft);
assert.deepEqual(report.mobile.swipeState.active, ["false", "false", "true"]);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
