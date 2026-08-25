# AJ Luxury — Gauntlet Awwwards Motion

Status: `CANDIDATE BUILT — BLIND JURY PENDING`

## Frozen input

- Integration branch: `codex/audit-front-20260823`
- Requested audit reference: `8f23d21`
- Integration baseline already present on the Codex branch: `a3c2311`
- Production truth, read-only: `https://ajluxurystore.com/`
- Production source baseline: `origin/main:app/page.tsx`
- Inventory truth: `730` units; stock code and data are out of scope.
- Assets: existing AJ Luxury assets only. No image or campaign generation.
- Production, domains and `cloudflare.production.jsonc`: no mutation without Adam then Jérémy validating the exact candidate.

## Bar, verbatim

Rebuild the homepage form and motion system from scratch while preserving the
validated production identity, information architecture, product truth, copy,
assets, routes and purchase paths. The rendered candidate must score at least
`9.5/10` overall with no jury dimension below `9.0`, and must not trigger a
fatal veto.

### Jury dimensions

1. Production fidelity: brand, copy, section order, assets, colorways and links.
2. Art direction: premium masculine sensuality, restraint and photographic hierarchy.
3. Motion craft: GSAP choreography, physical continuity, pacing and interruption.
4. Storytelling: desire → Apollon → three colorways → house belief → purchase.
5. E-commerce UX: product understanding, clear CTAs and one-click PDP access.
6. Responsive/accessibility: mobile, touch, keyboard, focus, zoom and reduced motion.
7. Engineering/performance: cleanup, no leaks, stable layout, 60 fps target and bounded JS.

### Fatal vetoes

- Any generated, recreated or substituted campaign asset.
- Any invented claim, product, price, stock signal, testimonial or route.
- Any degradation of the production purchase path or navigation.
- Scroll hijacking, trapped reading, inaccessible motion or missing reduced-motion state.
- Animating layout properties, permanent broad `will-change`, or orphaned ScrollTriggers.
- Horizontal overflow, clipped face/product, hidden CTA, console/runtime error or CLS > 0.10.
- Production or domain mutation without the required two approvals.

## References

- Fidelity reference: the real production homepage at desktop and mobile.
- Commerce/photo-trust reference: Derek Rose and CDLP depth, without copying their identity.
- Motion reference: Awwwards-grade editorial sequencing, judged on the rendered artifact,
  never on implementation intent.

## Production design-system lock

The live site and `origin/main` were measured before implementation.

- One font only: `AJ Manrope`, variable 200–800, from
  `/fonts/manrope-latin-v1.woff2`.
- Display: weight 300–320, tracking `-0.075em`, line-height `0.82–0.86`.
- Commerce product name: weight 430, tracking `-0.04em`, 18–27 px.
- Chrome/actions: weight 600–650, 8–11 px, tracking `0.10–0.14em`.
- Home gutter: `clamp(18px,2.8vw,44px)`, 16 px on mobile.
- Palette only: `#111112`, `#f6f6f3`, `#ececeb`, `#b7b9be`,
  `#59595c`, `#7d0f52`, `#dda9bd`, `#a9abd9`, plus the exact
  production section blacks and papers.
- Production information architecture is preserved:
  `hero → editorial triptych → Apollon → moodboard → manifesto → footer`.
- Production StoreHeader, StoreFooter and their shared CSS module were restored
  from `origin/main`; the branch's 15 px chrome floor and serif display token
  are not used by this candidate.
- Hero film removed entirely. The hero uses the approved existing campaign
  stills only; no video source, poster frame, generated image or replacement
  campaign asset is rendered.

## Candidate motion system

- Hero: CSS first-paint line reveal plus GSAP media/copy scroll depth.
- Editorial triptych: one native sticky scene on desktop, scroll-linked
  transform/opacity composition; native horizontal scroll-snap on mobile.
- Apollon: one native sticky three-chapter scene on desktop, with product image,
  exact name and direct PDP link for Rose, Lilas and Pourpre; native rail on
  mobile.
- Moodboard: exact production assets with bounded image-only parallax.
- Manifesto: exact `brandStory` copy and exact two production routes.
- No scroll hijack, smooth-scroll runtime, WebGL, canvas, custom cursor,
  magnetic CTA, sound or synthetic asset.
- `prefers-reduced-motion` removes sticky motion variants and leaves every
  product/link visible in the normal document flow.

## Technical evidence before jury

- Focused ESLint: pass.
- `git diff --check`: pass.
- Full preproduction `npm run build`: pass, including analytics boundary and
  final-artifact checks.
- TypeScript: only the pre-existing `cloudflare:workers` ambient-module error
  in `db/index.ts`.
- Live local browser: desktop 1440×900 inspected at hero, triptych, all three
  Apollon states, moodboard, manifesto and footer; mobile 390×844 inspected
  through the governed local preview-frame path at hero, Apollon rail,
  moodboard, manifesto and footer.
- No current runtime error observed after a clean reload; earlier Vite HMR
  messages occurred only while the component file was being replaced.

## Budget and orchestration

- Minimum rounds: 3.
- Maximum rounds: 6, or stop after two consecutive rounds without score improvement.
- Parallel width: 3 read-only expert lines maximum.
- One integration owner: root Codex agent.
- Fresh blind critic each round; builders never grade themselves.
- Each round freezes a SHA before criticism.

## Workbench

| Unit | Round | Verdict | Evidence | Artifact |
|---|---:|---|---|---|
| Production truth | 0 | PASS | Live desktop + `origin/main` computed-token ledger | complete |
| Motion system | 0 | PASS | GSAP storyboard + bounded transform/opacity system | complete |
| Story/e-commerce | 0 | PASS | Exact production order, copy, routes and assets | complete |
| Integrated candidate | 0 | BUILT | Browser render + successful preproduction build | working tree |
| Final jury | 0 | NOT STARTED | Blind artifact inspection | pending |

## Round log

- R0: previous photo-only candidate rejected by Adam. New direction resets the
  form around production truth and an intentional full-motion system.
