import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const viewports = Object.freeze([
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [768, 1024],
  [430, 932],
  [390, 844],
  [360, 800],
  [320, 568],
]);

test("responsive contract covers the eight project viewports plus 320px", () => {
  assert.equal(viewports.length, 9);
  assert.deepEqual(viewports[0], [1920, 1080]);
  assert.deepEqual(viewports.at(-1), [320, 568]);
  assert.ok(viewports.every(([width, height]) => width >= 320 && height >= 568));
});

test("demo layout collapses safely, clips document overflow and avoids data clipping", async () => {
  const css = await readFile(
    new URL("../app/components/demo/DemoJourney.module.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1\.35fr\)\s+minmax\(310px,\s*0\.65fr\)/);
  assert.match(css, /@media \(max-width: 1000px\)/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /@media \(max-width: 359px\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /minmax\(0,\s*1fr\)/);
  assert.match(
    css,
    /@media \(max-width: 680px\)[\s\S]*?\.environmentBanner\s*\{[\s\S]*?overflow-x:\s*clip/,
  );
  assert.doesNotMatch(css, /\.environmentBanner\s*\{[\s\S]*?overflow-x:\s*auto/);
  assert.doesNotMatch(
    css,
    /@media \(max-width: 359px\)[\s\S]*?\.dhlSimulationText\s*\{[\s\S]*?display:\s*none/,
  );
  assert.match(css, /\.dhlSimulationText\s*\{[\s\S]*?font-size:\s*11px/);
  assert.match(css, /\.fieldNote,[\s\S]*?color:\s*#5f5f65;[\s\S]*?font-size:\s*12px/);
  assert.match(css, /\.timeline p\s*\{[\s\S]*?color:\s*#5f5f65;[\s\S]*?font-size:\s*12px/);
  assert.match(css, /\.addressPreview > span\s*\{[\s\S]*?color:\s*#5f5f65;[\s\S]*?font-size:\s*12px/);
  assert.match(css, /\.controlIndex\s*\{[\s\S]*?color:\s*#5f5f65;[\s\S]*?font-size:\s*12px/);
});

test("all primary controls meet 44px and retain visible keyboard focus", async () => {
  const css = await readFile(
    new URL("../app/components/demo/DemoJourney.module.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /\.environmentBanner\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.primaryButton,[\s\S]*?min-height:\s*52px/);
  assert.match(css, /\.sectionContent input,[\s\S]*?min-height:\s*50px/);
  assert.match(css, /\.destinationChoice\s*\{[\s\S]*?min-height:\s*72px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:\s*2px solid #7d0f52/);
});

test("interaction surfaces are native keyboard and touch controls", async () => {
  const checkout = await readFile(
    new URL("../app/components/demo/DemoCheckoutJourney.tsx", import.meta.url),
    "utf8",
  );
  const returns = await readFile(
    new URL("../app/components/demo/DemoReturnRefund.tsx", import.meta.url),
    "utf8",
  );
  assert.match(checkout, /<button[^>]*type="submit"/);
  assert.match(checkout, /<input[\s\S]*?type="radio"/);
  assert.doesNotMatch(checkout, /onClick=.*<div/);
  assert.match(returns, /<button[^>]*type="submit"/);
  assert.match(returns, /<select/);
  assert.doesNotMatch(returns, /onClick=.*<div/);
});
