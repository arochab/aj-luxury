import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { getProducts, sizes } from "../../lib/products";
import { getServerCommerceRuntimeMode } from "../../lib/commerce/commerce-runtime.server";
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
    "Découvrez Apollon, le boxer AJ Luxury décliné en Rose Velours, Lilas Céleste et Pourpre Impérial.",
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
          <p className={styles.eyebrow} data-aj-reveal>
            <T id="nav.shop" /> · <T id="shop.title" />
          </p>

          <h1
            className={`${styles.titre} aj-metal`}
            id="boutique-titre"
            data-aj-reveal
          >
            Apollon
          </h1>

          <p className={styles.chapo} data-aj-reveal>
            <T id="home.incarnationBody" />
          </p>

          <dl className={styles.faits} data-aj-reveal>
            <div className={styles.fait}>
              <dt>
                <T id="nav.apollon" />
              </dt>
              <dd className={styles.prix}>
                <LocalizedPrice amountCents={prixCents} />
              </dd>
              {runtimeMode !== "production" && (
                <dd className={styles.prixNote}>
                  <T id="product.priceLabel" />
                </dd>
              )}
            </div>

            <div className={styles.fait}>
              <dt>
                <T id="home.colors" />
              </dt>
              <dd>
                {products.map((product) => product.name).join(" · ")}
              </dd>
            </div>

            <div className={styles.fait}>
              <dt>
                <T id="home.sizes" />
              </dt>
              <dd>{sizes.join(" · ")}</dd>
            </div>

            <div className={styles.fait}>
              <dt>
                <T id="product.composition" />
              </dt>
              <dd>94 % modal · 6 % élasthanne</dd>
            </div>
          </dl>
        </section>

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
                data-aj-presse : la moitié « départ » du relais vers la fiche.
                Le geste est posé par GSAP dans AjScrollReveal — rien ici
                n'intercepte le clic, <Link> navigue et précharge comme
                d'habitude.
              */}
              <Link
                className={styles.carteLien}
                href={`/products/${product.slug}`}
                data-aj-presse
              >
                <span className={styles.carteMedia}>
                  <Image
                    unoptimized
                    src={product.image}
                    alt={`${product.model} ${product.name}`}
                    fill
                    sizes="(max-width: 760px) 100vw, 33vw"
                    priority={index === 0}
                  />
                </span>
                <span className={styles.carteVoile} aria-hidden="true" />

                {/*
                  La numérotation suit l'ordre de déclaration de
                  lib/products.ts, qui est l'ordre canonique rose, lilas,
                  pourpre — le même que ORDRE_COLORIS sur l'accueil. Les deux
                  écrans numérotent donc les trois coloris identiquement.
                */}
                <span className={styles.carteIndex} aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <span className={styles.carteAction}>
                  <T id="shop.discover" />
                  <span aria-hidden="true">→</span>
                </span>

                <span className={styles.carteBas}>
                  <span className={`${styles.carteNom} aj-metal`}>
                    {product.name}
                  </span>

                  <span className={styles.carteLigne}>
                    <span className={styles.carteTon}>
                      <LocalizedProductText slug={product.slug} field="tone" />
                    </span>
                    <span className={styles.cartePrix}>
                      <LocalizedPrice amountCents={product.priceCents} />
                    </span>
                  </span>

                  <span className={styles.carteTailles} aria-hidden="true">
                    {sizes.map((size) => (
                      <span key={size}>{size}</span>
                    ))}
                  </span>
                </span>

                <span className={styles.carteFilet} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>

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
            <h2 className={styles.composition} id="boutique-matiere" data-aj-reveal>
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
