import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(new URL(relativePath, projectRoot), "utf8"),
  );
}

test("all supported locales have complete, non-empty dictionaries", async () => {
  const manifest = await readJson("lib/i18n/manifest.json");
  const reference = await readJson("lib/i18n/dictionaries/fr.json");
  const referenceKeys = Object.keys(reference).sort();

  assert.equal(manifest.defaultLocale, "fr");
  assert.deepEqual(manifest.supportedLocales, ["fr", "en", "es", "de", "it"]);

  for (const locale of manifest.supportedLocales) {
    const dictionary = await readJson(
      `lib/i18n/dictionaries/${locale}.json`,
    );
    const keys = Object.keys(dictionary).sort();

    assert.deepEqual(keys, referenceKeys, `${locale}: dictionary keys differ`);

    for (const [key, value] of Object.entries(dictionary)) {
      assert.equal(typeof value, "string", `${locale}.${key}: must be a string`);
      assert.notEqual(value.trim(), "", `${locale}.${key}: must not be empty`);
    }
  }
});

test("unapproved long client copy falls back explicitly to French", async () => {
  const entries = await readJson("lib/i18n/client-copy.json");

  for (const [key, entry] of Object.entries(entries)) {
    assert.equal(entry.sourceLocale, "fr", `${key}: source must remain French`);
    assert.equal(
      entry.fallbackLocale,
      "fr",
      `${key}: fallback must be explicit`,
    );
    assert.notEqual(entry.source.trim(), "", `${key}: source must not be empty`);

    if (entry.status === "source-only") {
      assert.deepEqual(
        entry.translations,
        {},
        `${key}: unapproved translations must not be invented`,
      );
    }
  }
});
