import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { getProducts, sizes } from "../../lib/products";
import {
  getServerCommerceRuntimeMode,
  isServerCommerceReview,
} from "../../lib/commerce/commerce-runtime.server";
import LocalizedPrice from "../components/LocalizedPrice";
import LocalizedProductText from "../components/LocalizedProductText";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { AjScrollReveal } from "../components/ProductGalleryZoom";
import { T } from "../../lib/i18n/TranslatedText";
import styles from "../components/Boutique.module.css";

export const metadata: Metadata = {
  title: "Boutique | AJ Luxury",
  description:
    "Apollon, premier modèle AJ Luxury, décliné en Rose Velours, Lilas Céleste et Pourpre Impérial.",
};

/*
 * L'image de la matière est la même que celle de #matiere sur la maquette :
 * la ceinture 3,5 cm et sa plaque métal. Chemin vérifié dans public/ — aucun
 * actif n'est inventé ici.
 */
const MATIERE_IMAGE = "/images/client/product-pourpre-detail.webp";

export default function ShopPage() {
  const products = getProducts();
  const runtimeMode = getServerCommerceRuntimeMode();
  const reviewMode = isServerCommerceReview();
  const prixCents = products[0]?.priceCents ?? null;

  return (
    <main className={styles.boutique}>
      <StoreHeader />

      {/*
        AjScrollReveal est en display:contents — il ne sert que de portée aux
        sélecteurs GSAP. Les blocs marqués data-aj-reveal sont révélés par
        ScrollTrigger.batch, ceux marqués data-aj-para reçoivent la parallaxe.
      */}
      <AjScrollReveal className={styles.scene}>
        <section className={styles.ouverture} aria-labelledby="boutique-titre">
          {/*
            L'OUVERTURE ET LA GRILLE NE FONT QU'UNE SEULE SECTION, ET LEUR
            ORDRE CHANGE À 900 px.

            Au-delà de 900 px : bande à deux colonnes — l'identité à gauche, ce
            qu'on en dit à droite —, puis les trois photographies dessous.
            C'est le geste du premier écran de l'étalon principal, qui pose son
            logotype à gauche et sa phrase produit en colonne droite au lieu
            d'empiler quatre blocs.

            SOUS 900 px, LA MÊME PILE COÛTAIT UN ÉCRAN ENTIER. Mesuré le 20/08
            à 390x844 : en-tête 110 px, puis étiquette, titre, chapô, filet,
            prix, mention de vente et lien, soit 455 px — 54 % de l'écran —
            avant la première photographie, laquelle était ensuite coupée de
            14 px par la ligne de flottaison, son nom tombant 91 px dessous.
            L'étalon secondaire, lui, ouvre sa boutique à 118 px sur 844, soit
            14 %, sans une ligne de discours au-dessus de la grille.

            Le bloc commercial — chapô, filet, prix, mention et lien — passe
            donc SOUS la bande des trois photographies. Il ne reste au-dessus
            que l'étiquette et « Apollon ». Rien n'est retiré, rien n'est
            réécrit : c'est un ordre, pas une coupe.

            L'ORDRE DU DOM EST CELUI DU TÉLÉPHONE, PAS CELUI DU BUREAU. Le
            bloc commercial est écrit ici après la liste, et c'est le bureau
            qui le replace en colonne droite par grid-row. L'inverse aurait
            envoyé le focus clavier sur un lien situé hors écran, sous les
            trois photographies ; ici le saut de focus reste à l'intérieur du
            premier écran.
          */}
          <div className={styles.identite}>
            <p className={styles.eyebrow} data-aj-reveal>
              <T id="nav.shop" />
            </p>

            <h1
              className={styles.titre}
              id="boutique-titre"
              data-aj-reveal
            >
              Apollon
            </h1>
          </div>

          {/* role="list" : Safari retire les sémantiques de liste dès que
              list-style vaut none. */}
          <ul className={styles.grille} role="list" aria-label="Apollon">
            {products.map((product, index) => (
              <li
                className={styles.carte}
                id={product.slug}
                key={product.slug}
                data-aj-reveal
                /* L'accent descend du swatch produit : jamais une couleur inventée. */
                style={{ "--bq-accent": product.swatch } as CSSProperties}
              >
                {/*
                  LA STRUCTURE DE L'ÉTALON SECONDAIRE, PRISE À LA LETTRE.
                  Sur ses 16 cartes, la photographie ne porte AUCUN texte : ni
                  appel, ni pastille, ni prix. La métadonnée vit sous l'image, sur
                  le sol de la page, en trois lignes courtes. Nos cartes faisaient
                  l'inverse — « Découvrir » en haut, nom, ton et prix en bas, tout
                  posé sur le vêtement, et donc un voile de noir obligatoire pour
                  que ce texte reste lisible.

                  CONSÉQUENCE MESURABLE SUR « TROP SOMBRE » : plus un seul mot sur
                  la photo, donc plus de voile du tout. `.carteVoile` est supprimé.
                  Chaque pixel du vêtement est désormais rendu à sa luminance
                  réelle, y compris la ceinture et la plaque métal.

                  CONSÉQUENCE SUR LA LIGNE DE FLOTTAISON : le nom n'est plus
                  arrimé au BAS d'une photographie de 708 px, il suit le cadre à
                  16 px. Le cadre, lui, est devenu une constante réglée sur la
                  hauteur d'écran (voir --bq-h dans Boutique.module.css).
                */}
                <Link
                  className={styles.carteLien}
                  href={`/products/${product.slug}`}
                  data-aj-presse
                >
                  <span className={styles.carteCadre}>
                    <Image
                      unoptimized
                      src={product.image}
                      alt={`${product.model} ${product.name}`}
                      fill
                      sizes="(max-width: 700px) 100vw, 33vw"
                      priority={index === 0}
                    />

                    {/*
                      LE REVERS DE LA CARTE — 22/08.
                      Au survol, le corps porté cède la place à la nature morte
                      du même coloris. Ce n'est pas un effet ajouté : c'est le
                      DIPTYQUE que la séquence de l'accueil raconte déjà —
                      l'objet et le corps —, rendu ici en un geste.

                      Le calque est décoratif et le reste : `alt=""`, et il ne
                      dit rien qu'un lecteur d'écran n'ait déjà entendu du plan
                      porté juste au-dessus.
                    */}
                    <span
                      className={styles.carteRevers}
                      aria-hidden="true"
                      style={
                        { "--revers": `url("${product.still}")` } as CSSProperties
                      }
                    >
                      <span className={styles.carteReversFond} />
                    </span>

                    <span className={styles.carteFilet} aria-hidden="true" />
                  </span>

                  <span className={styles.carteBas}>
                    {/*
                      La ligne constante puis la variable, dans cet ordre : c'est
                      la mécanique de l'étalon, qui répète « UNIFORM » sur chaque
                      carte et ne fait varier que le nom. Ici le constant est
                      « APOLLON », le variable est l'heure de la lumière, et le
                      nom du coloris porte seul le corps d'affichage.
                    */}
                    <span className={styles.carteTon}>
                      <LocalizedProductText slug={product.slug} field="tone" />
                    </span>

                    <span className={styles.carteNom}>{product.name}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className={styles.dire}>
            <div className={styles.statut} data-aj-reveal>
              <p className={styles.prix}>
                <LocalizedPrice amountCents={prixCents} />
              </p>

              {/*
                Le prix reste ICI, collé à la vérité commerciale, et n'est pas
                répété sur les trois cartes. L'étalon secondaire porte un prix
                par carte parce que ses 35 pièces ont 35 prix ; les nôtres ont
                le même. Répété trois fois, le prix devient un gabarit — et
                surtout il se détacherait de la phrase qui dit que la vente
                n'est pas ouverte, qui est la seule raison pour laquelle on
                peut afficher un prix sans mentir.
              */}
              {reviewMode ? (
                <p className={styles.statutNote}>
                  <T id="shop.reviewNotice" />
                </p>
              ) : runtimeMode !== "production" && (
                <p className={styles.statutNote}>
                  <T id="shop.saleNotice" />{" "}
                  <Link className={styles.statutLien} href="/contact">
                    <T id="shop.notify" />
                  </Link>
                </p>
              )}
            </div>
          </div>
        </section>

        <section className={styles.matiere} aria-labelledby="boutique-matiere">
          <div className={styles.matiereFrame}>
            <div className={styles.matiereMedia} data-aj-para>
              <Image
                unoptimized
                src={MATIERE_IMAGE}
                alt="Ceinture premium 3,5 cm, logo métallique AJ Luxury"
                fill
                sizes="(max-width: 760px) 100vw, 50vw"
              />
            </div>
          </div>

          <div className={styles.matiereTexte}>
            <div className={styles.matiereBloc}>
              <h2
                className={styles.composition}
                id="boutique-matiere"
                data-aj-reveal
              >
                <span className={styles.chiffre}>94</span>
                <span className={styles.compositionLabel}>
                  <T id="home.materialModal" />
                </span>
                <span className={styles.chiffre}>6</span>
                <span className={styles.compositionLabel}>
                  <T id="home.materialElastane" />
                </span>
              </h2>

              <p className={styles.matierePhrase} data-aj-reveal>
                <T id="home.apollonStatement" />
              </p>

              {/*
                La colonne de droite de cette section était remplie à 18 % —
                233 px de contenu dans 1289 px à 1920, un vide né de deux hauteurs
                incompatibles, que l'AGENTS compte explicitement comme un défaut.
                Les deux faits qui encombraient l'ouverture le remplissent : ils
                décrivent la pièce, ils sont donc à leur place ici, contre la
                matière. La composition n'est pas répétée — le 94 / 6 ci-dessus
                la dit déjà, au corps le plus grand de la page.
              */}
              <dl className={styles.faits} data-aj-reveal>
                <div className={styles.fait}>
                  <dt>
                    <T id="home.colors" />
                  </dt>
                  {/* Un nom de coloris ne se coupe jamais en deux : la césure
                      tombe sur les séparateurs. */}
                  <dd>
                    {products.map((product, index) => (
                      <span key={product.slug}>
                        {index > 0 ? " · " : null}
                        <span className={styles.insecable}>{product.name}</span>
                      </span>
                    ))}
                  </dd>
                </div>

                <div className={styles.fait}>
                  <dt>
                    <T id="home.sizes" />
                  </dt>
                  <dd>{sizes.join(" · ")}</dd>
                </div>
              </dl>
            </div>

            <span className={styles.matiereSignature} data-aj-reveal>
              <T id="nav.material" /> · <T id="product.feature.5" />
            </span>
          </div>
        </section>
      </AjScrollReveal>

      <StoreFooter />
    </main>
  );
}
