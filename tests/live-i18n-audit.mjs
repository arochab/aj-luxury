const baseUrl = process.env.AJ_LUXURY_URL ??
  "https://aj-luxury-preview.adam-chabbi94.workers.dev";
const cdpPort = process.env.CDP_PORT ?? "9229";
const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, {
  method: "PUT",
}).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let commandId = 0;

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function send(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function waitForLoad() {
  await new Promise((resolve) => setTimeout(resolve, 800));
}

async function navigate(pathname) {
  await send("Page.navigate", { url: `${baseUrl}${pathname}` });
  await waitForLoad();
}

await send("Page.enable");
await send("Runtime.enable");
await navigate("/");

const cases = {
  en: {
    shop: "Shop",
    storyTitle: "Our story",
    accountTitle: "Account",
    legalTitle: "Terms and conditions of sale",
    tone: "Apollon at dusk",
    size: "Select a size",
    feature: "Classic boxer cut",
    story: "The garment no one sees",
    account: "01 · Orders",
    legal: "Official French version",
  },
  es: {
    shop: "Tienda",
    storyTitle: "Nuestra historia",
    accountTitle: "Cuenta",
    legalTitle: "Condiciones generales de venta",
    tone: "Apollon en el ocaso",
    size: "Elegir una talla",
    feature: "Corte bóxer clásico",
    story: "La prenda que nadie ve",
    account: "01 · Pedidos",
    legal: "Versión francesa oficial",
  },
  de: {
    shop: "Shop",
    storyTitle: "Unsere Geschichte",
    accountTitle: "Konto",
    legalTitle: "Allgemeine Verkaufsbedingungen",
    tone: "Apollon in der Dämmerung",
    size: "Größe auswählen",
    feature: "Klassischer Boxerschnitt",
    story: "Das Kleidungsstück, das niemand sieht",
    account: "01 · Bestellungen",
    legal: "Offizielle französische Fassung",
  },
  it: {
    shop: "Boutique",
    storyTitle: "La nostra storia",
    accountTitle: "Account",
    legalTitle: "Condizioni generali di vendita",
    tone: "Apollon al tramonto",
    size: "Scegli una taglia",
    feature: "Classico taglio boxer",
    story: "Il capo che nessuno vede",
    account: "01 · Ordini",
    legal: "Versione ufficiale francese",
  },
};

const forbiddenFrench = [
  "Sous-vêtements masculins conçus",
  "Choisir une taille",
  "Description complète",
  "Le vêtement que personne ne voit",
  "Votre compte",
  "Renoncer au contrat ici",
];

for (const [locale, markers] of Object.entries(cases)) {
  await send("Runtime.evaluate", {
    expression: `localStorage.setItem("aj-luxury.locale.v1", ${JSON.stringify(locale)})`,
  });

  const routes = [
    ["/shop", [markers.shop, markers.tone], markers.shop],
    ["/products/pourpre", [markers.size, markers.feature], null],
    ["/notre-histoire", [markers.story], markers.storyTitle],
    ["/account", [markers.account], markers.accountTitle],
    ["/terms", [markers.legal], markers.legalTitle],
  ];

  for (const [pathname, expected, expectedTitle] of routes) {
    await navigate(pathname);
    const result = await send("Runtime.evaluate", {
      expression: `(() => {
        const visibleDom = document.body.cloneNode(true);
        visibleDom.querySelectorAll("script, style, noscript").forEach((node) => node.remove());
        return JSON.stringify({
          text: visibleDom.textContent,
          title: document.title,
          lang: document.documentElement.lang,
          overflow: document.documentElement.scrollWidth > window.innerWidth
        });
      })()`,
      returnByValue: true,
    });
    const snapshot = JSON.parse(result.result.value);

    if (snapshot.lang !== locale) {
      throw new Error(`${locale}${pathname}: expected html lang=${locale}, got ${snapshot.lang}`);
    }
    if (snapshot.overflow) {
      throw new Error(`${locale}${pathname}: horizontal overflow`);
    }
    if (expectedTitle && !snapshot.title.startsWith(expectedTitle)) {
      throw new Error(
        `${locale}${pathname}: expected localized title (${expectedTitle}), got (${snapshot.title})`,
      );
    }
    for (const marker of expected) {
      if (!new RegExp(marker, "i").test(snapshot.text)) {
        throw new Error(`${locale}${pathname}: missing localized marker (${marker})`);
      }
    }
    for (const phrase of forbiddenFrench) {
      if (new RegExp(phrase, "i").test(snapshot.text)) {
        throw new Error(`${locale}${pathname}: French leakage (${phrase})`);
      }
    }
  }
}

socket.close();
console.log(`Live i18n audit passed for ${Object.keys(cases).length} languages × 5 routes.`);
