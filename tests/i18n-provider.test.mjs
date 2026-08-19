import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function readSource(relativePath) {
  return readFile(new URL(relativePath, projectRoot), "utf8");
}

test("the root layout installs the i18n provider without changing page content", async () => {
  const layout = await readSource("app/layout.tsx");

  assert.match(layout, /<html lang="fr" suppressHydrationWarning>/);
  assert.match(layout, /<I18nProvider>\{children\}<\/I18nProvider>/);
  assert.doesNotMatch(layout, /StoreHeader|StoreFooter|LanguageSwitcher/);
});

test("the provider localizes preference, html lang and the browser title", async () => {
  const provider = await readSource("lib/i18n/I18nProvider.tsx");

  assert.match(provider, /resolvePreferredLocale\(\)/);
  assert.match(provider, /persistLocale\(nextLocale\)/);
  assert.match(
    provider,
    /fetch\(`\/media\/i18n\/\$\{locale\}\.json\?v=v6`/,
  );
  assert.match(provider, /dictionaryCache/);
  assert.doesNotMatch(provider, /import \{ translate,/);
  assert.doesNotMatch(provider, /import\("\.\/dictionaries\//);
  assert.match(
    provider,
    /document\.documentElement\.lang = localeMetadata\[locale\]\.htmlLang/,
  );
  assert.match(provider, /PAGE_TITLE_KEYS\[pathname\]/);
  assert.match(provider, /document\.title = `\$\{localizedTitle\} \| AJ Luxury`/);
  assert.match(provider, /useI18n must be used inside I18nProvider/);
});

test("non-French dictionaries are fetched on demand from exact static copies", async () => {
  for (const locale of ["de", "en", "es", "it"]) {
    const [source, publicCopy] = await Promise.all([
      readSource(`lib/i18n/dictionaries/${locale}.json`),
      readSource(`public/i18n/${locale}.json`),
    ]);
    assert.deepEqual(JSON.parse(publicCopy), JSON.parse(source));
  }
});

test("header and footer expose the connected language selector", async () => {
  const header = await readSource("app/components/StoreHeader.tsx");
  const footer = await readSource("app/components/StoreFooter.tsx");
  const connectedSelector = await readSource(
    "app/components/SiteLanguageSwitcher.tsx",
  );
  const selector = await readSource("app/components/LanguageSwitcher.tsx");
  const styles = await readSource("app/components/StoreChrome.module.css");

  assert.match(header, /<SiteLanguageSwitcher placement="header" \/>/);
  assert.match(footer, /<SiteLanguageSwitcher placement="footer" \/>/);
  assert.match(connectedSelector, /onLocaleChange=\{setLocale\}/);
  assert.match(connectedSelector, /\scompact\s*\/>/);
  assert.match(selector, /supportedLocale\.toUpperCase\(\)/);
  assert.match(
    selector,
    /aria-label=\{localeMetadata\[supportedLocale\]\.nativeLabel\}/,
  );
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /\.languageSwitcher select/);
});
