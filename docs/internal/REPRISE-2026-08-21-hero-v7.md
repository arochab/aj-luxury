# Reprise — refonte front, hero v7

Session Claude Code du 21 août 2026, interrompue à la demande d'Adam (départ
en urgence). Branche : `claude/front-awwwards-20260817`.

Ce fichier ne remplace pas `HANDOFF-2026-08-21.md`, qui reste le récit des
cinq chantiers précédents. Il ne couvre que la passe en cours.

## Où on en est, en une phrase

Les actifs du hero v7 sont fabriqués et commités ; le composant est écrit ;
**il n'est branché nulle part et n'a jamais été compilé ni vu au navigateur**.
Le site dans son état actuel est donc strictement inchangé — aucun fichier
existant n'a été modifié, tout est en ajout.

## Ce qui a été établi (acquis, ne pas refaire)

1. **Les deux images attachées par Adam sont retrouvées et versionnées.**
   `_design-reference/hero-v7-sources/hero-v7-source-{A,B}-landscape-1672x941.png`,
   copiées depuis `Downloads/ChatGPT Image 21 août 2026, 09_52_{12,37}.png`.

2. **Écart signalé, non tranché par Adam.** Le brief annonce « IMAGE A =
   paysage bureau, IMAGE B = portrait téléphone ». Les deux fichiers reçus
   sont en réalité **paysage 1672x941 tous les deux** : ce sont deux variantes
   de direction artistique de la même scène, pas une paire paysage/portrait.
   B est la version chrome intégrale — socle gravé APOLLO, arc et carquois,
   sol miroir liquide. Hypothèse retenue faute d'arbitrage : A pour le bureau,
   B recadrée en portrait 704x941 pour le téléphone. **À confirmer par Adam.**

3. **Le détourage des corps fonctionne, et c'est le geste central de la v7.**
   La scène sépare proprement : les corps sont chromatiques (chroma 25-30), le
   décor chrome est achromatique (chroma ~5). `scripts/build_hero_v7_assets.py`
   produit deux calques superposés par master — `plate` (photo entière) et
   `figures` (corps détourés, alpha). Le mot AJ LUXURY se glisse entre les
   deux : **le mot-marque passe derrière les corps.** Vérifié à l'œil sur les
   deux prévisualisations de matte, visages et ceintures intacts.

4. **Poids mesurés** — premier écran bureau : 94 Ko (plate avif) + 79 Ko
   (figures webp) = **173 Ko**, contre 742 Ko pour le seul MP4 desktop v6.
   Sur la découpe paysage, WebP bat AVIF (79 contre 120 Ko) : l'ordre des
   `<source>` suit la mesure, c'est écrit et commenté dans `lib/hero-v7.ts`.

5. **Plafond de résolution, à dire à Adam.** Les masters plafonnent à
   1672x941. Un 1440x900 en DPR 2 demande 2880 px et en reçoit 1672 (1,72x).
   Aucun upscale génératif n'a été appliqué : ce sont de vrais visages. Le
   seul vrai palier est une **regénération des masters en 4K**.

6. **Inventaire GSAP** : gsap 3.15.0 + @gsap/react déjà installés, **jeu de
   plugins complet disponible** (SplitText, Flip, CustomEase, Observer,
   ScrollSmoother, DrawSVG, MorphSVG…). Socle d'animation existant et bon :
   `app/components/useAjMotion.ts` (contexte scopé, matchMedia, refresh après
   polices, révocation ordonnée). Ne pas le réécrire.

7. **Identité légale : rien à corriger, rien à inventer.** `lib/legal.ts` est
   la source unique ; SIREN, SIRET, TVA, siège, directeur de publication sont
   tous des `"À compléter — …"` explicites, et `/legal-notice` affiche déjà un
   avertissement. Aucune valeur inventée nulle part dans le dépôt. Les seules
   valeurs réelles sont celles de l'hébergeur Cloudflare. **Valeurs
   obligatoires manquantes = à fournir par Adam et Jérémy, pas par un agent.**

## Fichiers ajoutés par cette passe

| Fichier | État |
|---|---|
| `_design-reference/hero-v7-sources/*.png` | masters validés, versionnés |
| `scripts/build_hero_v7_assets.py` | pipeline déterministe, rejouable |
| `public/images/client/hero-v7-*.{avif,webp}` | 8 actifs générés |
| `lib/hero-v7.ts` | descripteurs + `selectHeroMaster()` |
| `app/components/HeroV7.tsx` | **écrit, jamais compilé** |
| `app/components/HeroV7.module.css` | **écrit, jamais rendu** |
| `.playwright-mcp/refonte-20260821/baseline/` | capture d'accueil 1440 avant refonte |

## La reprise, dans l'ordre exact

1. **Relancer le serveur** : `npm run dev` à la racine du dépôt (port 3000).
   Rappel de la session précédente : `npm run build` et les tests
   `rendered-html` exigent `APP_ENV=preproduction` et
   `PREPROD_TARGET_PROJECT_ID` = le `project_id` de `.openai/hosting.json`.

2. **Vérifier ce qui n'a jamais été vérifié.** Trois points précis, dans cet
   ordre, avant toute autre chose :
   - `app/components/HeroV7.tsx` référence le type `gsap.core.Tween` sans
     import de namespace — **très probablement une erreur TypeScript**. Le
     corriger en typant le paramètre par le retour de `gsap.to()`.
   - la fonction `ScrollTriggerVeille` est appelée avant sa déclaration dans
     le module ; c'est licite pour une déclaration de fonction, mais le
     nettoyage retourné par le callback `mm.add()` doit être vérifié.
   - `npm run lint` va analyser `HeroV7.tsx` **même s'il n'est importé nulle
     part**.

3. **Brancher le hero** dans `app/page.tsx` : remplacer `<HeroComposition />`
   et le bloc `styles.signature` qui le suit par `<HeroV7 />`. Attention :
   `story.quote` sort du premier écran — le plan est de le poser sur l'écran
   « RELEASE » en parchemin juste après, qui reste à créer.

4. **Régler le mot-marque à l'œil, au navigateur.** `--marqueMot` est en
   `calc(100vw / 5.05)` en paysage et `/4.2` en portrait : ces deux diviseurs
   sont des estimations posées à l'aveugle et **doivent être relevés à
   l'écran**, pas gardés par confort. Vérifier surtout que le mot croise bien
   les corps à hauteur de hanche et qu'aucune lettre ne se perd hors cadre.

5. **Ensuite seulement** : écran RELEASE, puis Shop, fiches produit, récit,
   pages commerce et légales, puis la boucle Gauntlet.

## Ce qu'il ne faut pas refaire

Le `HANDOFF-2026-08-21.md` §5 est confirmé par cette session : **les agents
mesurent bien et dessinent mal**. Le détourage et les poids d'actifs se
délèguent ; la composition se règle à l'œil, écran par écran, au navigateur.
Aucun essaim d'agents n'a été lancé ici — un seul agent de lecture, en
lecture seule, pour l'inventaire.

## Garde-fous respectés pendant la passe

- Aucune écriture hors du dépôt ; aucun fichier sur le Bureau.
- Aucun fichier existant modifié : la passe est en **ajout pur**.
- Production non touchée, aucun déploiement, aucun secret lu.
- Branche `claude/*`, worktree Codex `codex/ajl-sendcloud-controlled-20260817`
  laissé intact.
