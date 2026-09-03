import assert from "node:assert/strict";
import test from "node:test";

import { legacyPreviewRedirectResponse } from "../worker/legacy-preview-redirect.ts";

test("obsolete customer previews redirect to the canonical production route", () => {
  for (const hostname of [
    "aj-luxury-preview.adam-chabbi94.workers.dev",
    "aj-luxury-awwwards-branch-preview.adam-chabbi94.workers.dev",
  ]) {
    const response = legacyPreviewRedirectResponse(
      new Request(`https://${hostname}/shop?preview=old-layout`),
      { APP_ENV: "preview" },
    );
    assert.equal(response?.status, 308);
    assert.equal(response?.headers.get("location"), "https://ajluxurystore.com/shop");
    assert.equal(response?.headers.get("x-robots-tag"), "noindex, nofollow");
  }
});

test("the canonical site and non-preview runtimes are never redirected here", () => {
  assert.equal(legacyPreviewRedirectResponse(
    new Request("https://ajluxurystore.com/"),
    { APP_ENV: "preview" },
  ), null);
  assert.equal(legacyPreviewRedirectResponse(
    new Request("https://aj-luxury-awwwards-branch-preview.adam-chabbi94.workers.dev/"),
    { APP_ENV: "production" },
  ), null);
});
