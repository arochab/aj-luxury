/* eslint-disable @next/next/no-img-element -- médias client déjà optimisés : aucun runtime d'image à charger */

import Link from "next/link";
import type { CSSProperties } from "react";
import HeroComposition from "./components/HeroComposition";
import StoreFooter from "./components/StoreFooter";
import StoreHeader from "./components/StoreHeader";
import ClientCopyText from "./components/ClientCopyText";
import LocalizedPrice from "./components/LocalizedPrice";
import ApollonGuidedSequence from "./components/ApollonGuidedSequence";
import HomeGsapExperience from "./components/HomeGsapExperience";
import { T } from "../lib/i18n/TranslatedText";
import { formatPrice, getProducts } from "../lib/products";
import { editorialMoodboardImages } from "../lib/editorial-moodboard";
import styles from "./components/Accueil.module.css";

/* ==========================================================================
   Accueil — portage de _design-reference/claude-design-accueil.html
   --------------------------------------------------------------------------
   Quatre écrans portent le récit : #haut (le film), #plaque (le diptyque
   Apollon), #coloris, #matiere. Deux clôtures les suivent, l'éditorial et la
   signature, comme dans la maquette.

   Ce que le portage change par rapport à la maquette, et pourquoi :
     • la maquette simule le commerce (sélecteur de taille, bouton « Ajouter »,
       formulaire de newsletter). Le vrai site a un vrai panier et de vraies
       fiches produit : les cartes de coloris mènent aux fiches, la barre de
       tailles devient une ligne de spécification, et le bouton devient un lien
       vers la boutique. On n'imite pas un tunnel d'achat qui existe ailleurs ;
     • l'en-tête et le pied restent StoreHeader / StoreFooter, qui portent la
       navigation, le sélecteur de langue et le panier réels.

   L'en-tête est le PREMIER ENFANT DIRECT de <main class="aj-home">, hors du
   film et hors de HomeGsapExperience. Ce n'est pas cosmétique : `.aj-film`
   porte `overflow: hidden`, et un tel ancêtre annule le `position: sticky` de
   StoreChrome.module.css:35. Rendue dans le film, la barre sortait du champ
   avec lui et l'utilisateur traversait ensuite ~11 hauteurs d'écran — #plaque,
   #coloris, #matiere, éditorial, clôture — sans logo, sans menu et sans
   panier, sur un site marchand. `.aj-home` porte `overflow-x: clip`, que
   estDansUnConteneurDeDefilement() (StoreHeader.tsx:62) autorise
   explicitement : la barre y colle, et sa dérobade au scroll reste câblée.
   ========================================================================== */

/** L'ordre de la maquette : rose, lilas, pourpre. */
const ORDRE_COLORIS = ["rose-pale", "lilas-bleu-clair", "pourpre"] as const;

/** Qui pose pour quelle image de la campagne. */
const SIGNATURES: Record<string, string> = {
  "portrait-left": "Jérémy",
  duo: "Alex et Jérémy",
  "portrait-right": "Alex",
};

export default function Home() {
  const produits = getProducts();
  /* Un seul prix pour les trois coloris — même lecture que app/shop/page.tsx:31. */
  const prixCents = produits[0]?.priceCents ?? null;
  const coloris = ORDRE_COLORIS.map((slug) => {
    const produit = produits.find((item) => item.slug === slug) ?? produits[0];
    return {
      slug: produit.slug,
      nom: produit.name,
      tagline: produit.tagline,
      prix: formatPrice(produit.priceCents),
      image: produit.image,
      accent: produit.swatch,
    };
  });

  return (
    <main className="aj-home">
      <StoreHeader />

      <HomeGsapExperience>
        {/* ── 01 · Le film ─────────────────────────────────────────────── */}
        <span id="accueil" aria-hidden="true" />
        <section className="aj-film" id="haut" aria-labelledby="aj-signature">
          <HeroComposition />
          <div className="aj-film__grade" aria-hidden="true" />

          <div className={styles.signature}>
            <h1 className={styles.signatureTitre} id="aj-signature">
              <span className="aj-sr-only">AJ Luxury — </span>
              <span className={styles.signatureLigne}>
                <span lang="en">Reveal Your Inner Beauty</span>
              </span>
              <span className={styles.signatureEclat} aria-hidden="true" />
            </h1>
            <a className={styles.decouvrir} href="#plaque">
              <span className={styles.decouvrirMot}>
                <T id="hero.discover" />
              </span>
              <span className={styles.decouvrirFleche} aria-hidden="true">
                ↓
              </span>
            </a>
          </div>
        </section>

        {/* ── 02 · La plaque ───────────────────────────────────────────── */}
        <span id="apollon" aria-hidden="true" />
        <ApollonGuidedSequence coloris={coloris} />

        {/* ── 03 · Les coloris ─────────────────────────────────────────── */}
        <span id="collection" aria-hidden="true" />
        <section
          className={styles.coloris}
          id="coloris"
          aria-labelledby="aj-coloris-titre"
        >
          {/* « La collection » laissait entendre que la maison tient tout
              entière dans cette grille. Le titre nomme maintenant le rang
              d'Apollon. La clé home.apollonEyebrow existait déjà dans les cinq
              langues et n'était câblée nulle part ; elle portait un « 01 »
              qu'elle ne porte plus. */}
          <h2 className="aj-sr-only" id="aj-coloris-titre">
            <T id="home.apollonEyebrow" />
          </h2>

          <div className={styles.colorisGrille}>
            {coloris.map((item) => (
              <Link
                className={styles.carte}
                href={`/products/${item.slug}`}
                key={item.slug}
                style={{ "--accent": item.accent } as CSSProperties}
              >
                <img
                  src={item.image}
                  alt={`Boxer Apollon ${item.nom}`}
                  width={1731}
                  height={2600}
                  loading="lazy"
                  fetchPriority="low"
                  decoding="async"
                  sizes="(max-width: 760px) 100vw, 33vw"
                />
                <span className={styles.carteLegende}>
                  <span className={styles.carteNom}>{item.nom}</span>
                  <span className={styles.cartePrix}>{item.prix}</span>
                </span>
                <span className={styles.carteFilet} aria-hidden="true" />
              </Link>
            ))}
          </div>

          <div className={styles.colorisPied}>
            {/* Ligne de spécification, PAS un sélecteur. Le choix de taille
                appartient à la fiche produit, seul écran qui connaît le stock
                par taille (ProductPurchase.tsx:38, availability résolue serveur
                dans products/[slug]/page.tsx:57). Dessiner ici quatre boutons
                inertes promettait une action qui n'existait pas : on retire le
                cadre et le gabarit 58x48, et on nomme la plage à voix haute au
                lieu de la cacher dans un aria-label. */}
            <p className={styles.tailles}>
              <span className={styles.taillesIntitule}>
                <T id="home.sizes" />
              </span>
              <span className={styles.taillesPlage}>S · M · L · XL</span>
            </p>
            {/* Le prix, traité comme un chiffre d'affichage et non comme une
                mention — même traitement que Boutique.module.css:105, --t4 et
                graisse fine. L'accueil est l'écran dont la mission est de faire
                choisir : il ne peut pas être le seul à ne jamais dire combien.
                Les trois coloris partagent le même prix, un chiffre suffit. */}
            <p className="aj-home__prix">
              <span className="aj-home__prix-mention">
                <T id="nav.apollon" />
              </span>
              <span className="aj-home__prix-chiffre">
                <LocalizedPrice amountCents={prixCents} />
              </span>
            </p>
            <Link className={styles.colorisAction} href="/shop">
              <T id="home.viewBoutique" />
            </Link>
            <p className={styles.colorisNote}>
              94 % <T id="home.materialModal" /> · 03 <T id="home.colors" /> ·
              S—XL <T id="home.sizes" />
            </p>
          </div>
        </section>

        {/* ── 04 · La matière ──────────────────────────────────────────── */}
        <section
          className={styles.matiere}
          id="matiere"
          aria-labelledby="aj-matiere-titre"
        >
          <div className={styles.matiereCadre}>
            <img
              src="/images/client/product-pourpre-detail.webp"
              alt="Ceinture premium de 3,5 cm, logo métallique AJ Luxury"
              width={1731}
              height={2600}
              loading="lazy"
              fetchPriority="low"
              decoding="async"
              sizes="(max-width: 760px) 100vw, 50vw"
            />
          </div>

          <div className={styles.matiereTexte}>
            <h2 className="aj-sr-only" id="aj-matiere-titre">
              <T id="product.feature.2" />
            </h2>
            <p className={`aj-reveal ${styles.composition}`}>
              <span className={styles.compositionChiffre}>94</span>
              <span className={styles.compositionMot}>
                <T id="home.materialModal" />
              </span>
              <span className={styles.compositionChiffre}>6</span>
              <span className={styles.compositionMot}>
                <T id="home.materialElastane" />
              </span>
            </p>
            <p className={`aj-reveal ${styles.matiereEnonce}`}>
              <T id="home.apollonStatement" />
            </p>
            <span className={`aj-reveal ${styles.matiereLabel}`}>
              <T id="product.feature.5" />
            </span>
          </div>
        </section>

        {/* ── 05 · Éditorial ───────────────────────────────────────────── */}
        <section className={styles.editorial} aria-labelledby="aj-editorial-titre">
          <h2 className="aj-sr-only" id="aj-editorial-titre">
            <T id="home.incarnationEyebrow" />
          </h2>
          <div className={styles.editorialGrille}>
            {editorialMoodboardImages.map((image) => (
              <figure className={`aj-reveal ${styles.editorialFigure}`} key={image.src}>
                <img
                  src={image.src}
                  alt={image.alt}
                  width={image.width}
                  height={image.height}
                  loading="lazy"
                  fetchPriority="low"
                  decoding="async"
                  sizes="(max-width: 760px) 100vw, 33vw"
                />
                <figcaption>{SIGNATURES[image.crop] ?? "AJ Luxury"}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* ── 06 · Clôture ─────────────────────────────────────────────── */}
        <span id="histoire" aria-hidden="true" />
        <section className={styles.cloture} aria-labelledby="aj-cloture-titre">
          <div className={styles.clotureBloc}>
            <h2
              className={`aj-reveal aj-metal aj-display ${styles.clotureTitre}`}
              id="aj-cloture-titre"
            >
              <T id="story.quote" />
            </h2>
            {/* Ce paragraphe reprenait mot pour mot la phrase de clôture
                juste au-dessus, enveloppée dans « Chez AJ Luxury, nous sommes
                convaincus que » : la plus belle ligne du site était désamorcée
                par sa propre redite. Il porte maintenant la seule information
                que l'accueil ne donnait nulle part — le rang d'Apollon. C'est
                une intention, pas un catalogue : rien n'y laisse croire qu'un
                autre modèle est déjà achetable. */}
            <p className={`aj-reveal ${styles.clotureTexte}`}>
              <ClientCopyText copyKey="brandStory" />
            </p>
            <div className={`aj-reveal ${styles.clotureActions}`}>
              <Link href="/notre-histoire">
                <T id="home.discoverStory" />
              </Link>
              <Link href="/shop">
                <T id="story.discoverCollection" />
              </Link>
            </div>
          </div>
        </section>
      </HomeGsapExperience>

      <StoreFooter />
    </main>
  );
}
