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

test("client copy preserves the French source and localizes every supported language", async () => {
  const entries = await readJson("lib/i18n/client-copy.json");
  const expectedTranslations = ["en", "es", "de", "it"];

  for (const [key, entry] of Object.entries(entries)) {
    assert.equal(entry.sourceLocale, "fr", `${key}: source must remain French`);
    assert.equal(
      entry.fallbackLocale,
      "fr",
      `${key}: fallback must be explicit`,
    );
    assert.notEqual(entry.source.trim(), "", `${key}: source must not be empty`);

    assert.equal(entry.status, "localized", `${key}: localization status`);

    for (const locale of expectedTranslations) {
      assert.equal(
        typeof entry.translations[locale],
        "string",
        `${key}.${locale}: translation must exist`,
      );
      assert.notEqual(
        entry.translations[locale].trim(),
        "",
        `${key}.${locale}: translation must not be empty`,
      );
    }
  }
});

test("commercial and editorial copy is genuinely localized", async () => {
  const manifest = await readJson("lib/i18n/manifest.json");
  const french = await readJson("lib/i18n/dictionaries/fr.json");
  const localizedPrefixes = [
    "story.",
    "product.tone.",
    "product.description.",
    "product.detail.",
    "product.feature.",
    "footer.description",
    "account.orders",
    "account.profile",
    "account.security",
  ];
  const localizedKeys = Object.keys(french).filter((key) =>
    localizedPrefixes.some((prefix) => key.startsWith(prefix)) &&
    !key.endsWith("Label"),
  );

  for (const locale of manifest.supportedLocales.filter((item) => item !== "fr")) {
    const dictionary = await readJson(`lib/i18n/dictionaries/${locale}.json`);

    for (const key of localizedKeys) {
      assert.notEqual(
        dictionary[key],
        french[key],
        `${locale}.${key}: must not fall back to French`,
      );
    }
  }
});

test("customer-facing components do not pin translated copy to French", async () => {
  const [purchase, footer, story, infoPage] = await Promise.all([
    readFile(new URL("app/components/ProductPurchase.tsx", projectRoot), "utf8"),
    readFile(new URL("app/components/StoreFooter.tsx", projectRoot), "utf8"),
    readFile(new URL("app/notre-histoire/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/components/InfoPage.tsx", projectRoot), "utf8"),
  ]);

  assert.doesNotMatch(
    purchase,
    /lang="fr"|\{product\.description\}|\{product\.details|\{product\.features/,
  );
  assert.doesNotMatch(footer, /lang="fr"|Sous-vêtements masculins|Renoncer au contrat ici/);
  assert.doesNotMatch(story, /lang="fr"/);
  assert.match(infoPage, /officialFrenchOnly/);
});
