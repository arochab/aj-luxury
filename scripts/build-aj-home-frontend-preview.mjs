import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

function findTemplate(start) {
  let cursor = resolve(start);
  while (dirname(cursor) !== cursor) {
    const candidate = join(
      cursor,
      ".agents",
      "skills",
      "frontend-design",
      "assets",
      "preview-template.html",
    );
    if (existsSync(candidate)) return candidate;
    cursor = dirname(cursor);
  }
  throw new Error("Unable to locate the governed frontend-design template");
}

const templatePath = findTemplate(process.cwd());
const outputPath = new URL(
  "../.frontend-design/aj-luxury-home/2026-08-24-photo-only-gauntlet.html",
  import.meta.url,
);
const evidencePath = new URL(
  "../docs/internal/evidence/gauntlet-front-2026-08-24/",
  import.meta.url,
);
const fallbackScreens = {
  desktop: `data:image/png;base64,${(
    await readFile(new URL("round-4-home-1440x900.png", evidencePath))
  ).toString("base64")}`,
  mobile: `data:image/png;base64,${(
    await readFile(new URL("round-4-home-390x844.png", evidencePath))
  ).toString("base64")}`,
};

const rootTokens = `:root {
    --font-stack: system-ui, -apple-system, "Segoe UI", sans-serif;
    --preview-frame-inset: 8px;
    --preview-status-size: 12px;
    --preview-frame-border: #454551;
  }
  .theme-light {
    --surface-page:#08080a; --surface-panel:#111116; --surface-subtle:#191920;
    --surface-raised:#16161c; --border-subtle:#353541; --border-strong:#555563;
    --text-primary:#f7f6f4; --text-muted:#aaaab5; --accent-primary:#b9abd9;
    --shadow-panel-resolved:none;
  }
  .theme-dark {
    --surface-page:#0d0d11; --surface-panel:#08080a; --surface-subtle:#17171d;
    --surface-raised:#121218; --border-subtle:#3d3d49; --border-strong:#60606e;
    --text-primary:#f7f6f4; --text-muted:#aaaab5; --accent-primary:#a9abd9;
    --shadow-panel-resolved:none;
  }
  * { box-sizing`;

const liveWorkbenchCss = `  .live-frame {
    position:relative; overflow:hidden; padding:var(--preview-frame-inset);
    border:1px solid var(--preview-frame-border); background:#08080a;
  }
  .live-frame .mode-badge {
    position:absolute; z-index:4; top:calc(var(--preview-frame-inset) + 8px);
    left:calc(var(--preview-frame-inset) + 8px); padding:5px 8px;
    background:rgba(8,8,10,.9); border:1px solid rgba(255,255,255,.24);
    color:#f7f6f4; font-size:var(--preview-status-size); letter-spacing:.08em;
    text-transform:uppercase;
  }
  .frame-viewport { position:relative; overflow:hidden; background:#08080a; }
  .frame-viewport.desktop { width:518px; height:324px; }
  .frame-viewport.mobile { width:254px; height:549px; }
  .frame-viewport iframe, .frame-viewport .fallback {
    position:absolute; inset:0; display:block; border:0; transform-origin:top left;
  }
  .frame-viewport.desktop iframe { width:1440px; height:900px; transform:scale(.36); }
  .frame-viewport.mobile iframe { width:390px; height:844px; transform:scale(.65); }
  .frame-viewport .fallback { width:100%; height:100%; object-fit:contain; background:#08080a; }
  .live-frame[data-live-state="live"] .fallback { display:none; }
  .live-frame:not([data-live-state="live"]) iframe { visibility:hidden; }
  .live-frame[data-live-state="live"] .mode-badge { border-color:#7bc69b; color:#a9e7bf; }
  .live-frame[data-live-state="fallback"] .mode-badge { border-color:#e3ae67; color:#f0c98e; }
  .artifact-note { max-width:62ch; color:var(--text-muted); font-size:12px; margin:0 0 14px; }
  /* Direct edits */`;

function stageMarkup(pane) {
  const desktop = pane === "light";
  const mode = desktop ? "desktop" : "mobile";
  const dimensions = desktop ? "1440 × 900" : "390 × 844";
  const fallback = fallbackScreens[mode];
  return `<button class="pane-toggle-btn" type="button" data-pane="${pane}" title="Agrandir ce viewport" aria-label="Agrandir ce viewport">${desktop ? "▶" : "◀"}</button>
    <div class="label" data-fd-id="pane-treatment">Artefact réel · ${mode} ${dimensions}</div>
    <h2 class="theme-title" data-fd-id="preview-mode-title" data-fd-editable="text">Accueil AJ Luxury — live localhost ou capture réelle de repli</h2>
    <p class="artifact-note">Cette pane ne reconstruit pas l’interface. Elle charge la vraie route <code>/</code> ; si localhost est absent, elle affiche la capture QA Round 4 correspondante et le badge l’indique explicitement.</p>
    <div class="live-frame" data-fd-id="frame-live-${mode}" data-live-state="pending">
      <span class="mode-badge" aria-live="polite">Connexion localhost…</span>
      <div class="frame-viewport ${mode}">
        <img class="fallback" src="${fallback}" alt="Capture QA réelle AJ Luxury ${mode}">
        <iframe src="http://localhost:3000/?frontend-design=round-4&viewport=${mode}" title="AJ Luxury accueil réel — ${mode}" loading="eager"></iframe>
      </div>
    </div>`;
}

const previewPair = `    <section class="preview-pair" id="preview-pair"><div class="preview-grid"><div class="preview theme-light" id="preview-light" data-theme="light">${stageMarkup("light")}</div><div class="preview theme-dark" id="preview-dark" data-theme="dark">${stageMarkup("dark")}</div></div></section>
  </div>`;

const tokenScript = `const TOKENS = {
  cadrage: [
    { key: '--preview-frame-inset', intent: 'respiration autour de l’artefact réel', kind: 'slider', min: 0, max: 24, step: 2, defaultValue: 8, unit: 'px' },
    { key: '--preview-status-size', intent: 'taille du badge live / fallback', kind: 'slider', min: 10, max: 16, step: 1, defaultValue: 12, unit: 'px' }
  ],
  contour: [
    { key: '--preview-frame-border', intent: 'contour du wrapper de preview', kind: 'color', options: [
      { id: 'graphite', light: '#454551', dark: '#454551', note: 'graphite (default)' },
      { id: 'lilas', light: '#b9abd9', dark: '#a9abd9', note: 'lilas AJ' }
    ] }
  ]
};
const SECTION_ORDER = [['Cadrage du vrai site', 'cadrage'], ['Contour du wrapper', 'contour']];`;

const liveScript = `
const setAjFrameMode = (frame, mode) => {
  frame.dataset.liveState = mode;
  frame.querySelector('.mode-badge').textContent = mode === 'live'
    ? 'LIVE · localhost:3000'
    : 'FALLBACK · capture QA réelle';
};
window.addEventListener('message', event => {
  if (
    event.origin !== 'http://localhost:3000' ||
    event.data?.type !== 'aj-luxury-preview-ready' ||
    event.data?.round !== 'round-4'
  ) return;
  document.querySelectorAll('.live-frame').forEach(frame => {
    if (frame.querySelector('iframe')?.contentWindow === event.source) {
      setAjFrameMode(frame, 'live');
    }
  });
});
setTimeout(() => {
  document.querySelectorAll('.live-frame[data-live-state="pending"]').forEach(frame => {
    setAjFrameMode(frame, 'fallback');
  });
}, 2200);
`;

let html = await readFile(templatePath, "utf8");
html = html
  .replace('<html lang="en">', '<html lang="fr">')
  .replace('<title>frontend-design preview</title>', '<title>AJ Luxury · vrai accueil live/fallback · frontend-design</title>')
  .replace(/:root \{[\s\S]*?\.theme-dark \{[\s\S]*?\r?\n  \}\r?\n\r?\n  \* \{ box-sizing/, rootTokens)
  .replace(/  \.wb-header \{[\s\S]*?  \.preview-progress \.bar \{[\s\S]*?\r?\n  \}\r?\n\r?\n  \/\* Direct edits \*\//, liveWorkbenchCss)
  .replace('<h1>frontend-design preview</h1>', '<h1>AJ Luxury · accueil réel</h1>')
  .replace('Decision controls on the left · live preview on the right · click <strong>Comment Mode</strong> to annotate any element', 'Deux viewports de la vraie route locale, avec fallback explicite vers les captures QA réelles')
  .replace('<strong>Hover</strong> a dropdown option to preview live.\n          <strong>Click</strong> to commit. Drag sliders for continuous values.\n          Enable <strong>Comment Mode</strong> in the header to annotate any element in the preview.', '<strong>Live</strong> signifie que l’iframe charge localhost:3000. <strong>Fallback</strong> signifie que la capture QA Round 4 est affichée. Les contrôles ne prétendent modifier que le wrapper de cette preview.')
  .replace(/    <section class="preview-pair" id="preview-pair">[\s\S]*?    <\/section>\r?\n  <\/div>/, previewPair)
  .replace(/const PREVIEW_META = \{[\s\S]*?\r?\n\};/, `const PREVIEW_META = {
  source: '.frontend-design/aj-luxury-home/2026-08-24-photo-only-gauntlet.html',
  topic: 'aj-luxury-home',
  targetFile: 'scripts/build-aj-home-frontend-preview.mjs',
};
const PREVIEW_MODE = 'real localhost iframes with explicit real-screenshot fallback';`)
  .replace(/const TOKENS = \{[\s\S]*?\r?\n\};\r?\n\r?\nconst SECTION_ORDER = \[[\s\S]*?\r?\n\];/, tokenScript)
  .replace(/renderControls\(\);\r?\napplyAllDecisions\(\);/, `${liveScript}\nrenderControls();\napplyAllDecisions();`);

if (/wb-header|node-activity|inspector-details|form-sample|status-grid|aj-stage/.test(html)) {
  throw new Error("Sample or reconstructed UI survived the frontend-design adaptation");
}
for (const id of ["frame-live-desktop", "frame-live-mobile", "preview-mode-title"]) {
  if (!html.includes(`data-fd-id="${id}"`)) throw new Error(`Missing ${id}`);
}
await writeFile(outputPath, html);
