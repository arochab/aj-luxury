/* eslint-disable @next/next/no-img-element -- client-owned assets are already web-optimized */

import Link from "next/link";
import ClientCopyText from "./components/ClientCopyText";
import DeferredMetallicField from "./components/DeferredMetallicField";
import HomeChromaticBridge from "./components/HomeChromaticBridge";
import StaticProductionHero from "./components/StaticProductionHero";
import StoreFooter from "./components/StoreFooter";
import StoreHeader from "./components/StoreHeader";
import { T } from "../lib/i18n/TranslatedText";
import { getProducts } from "../lib/products";
import styles from "./components/ProductionHome.module.css";

/*
 * The hero is the only duo image on the page. Every identifiable solo plan
 * after it is unique and follows one strict reading order:
 * Jérémy / Alex / Jérémy / Alex / Jérémy / Alex.
 *
 * The final editorial band deliberately uses product details without a face,
 * so it does not create a hidden seventh model plan or break the alternation.
 */
const featuredEditorialImages = [
  {
    src: "/images/client/product-rose-model.webp",
    alt: "AJ Luxury — Alex — Apollon Rose Velours",
    crop: "portrait-left",
    width: 1731,
    height: 2600,
  },
  {
    src: "/images/client/campaign-duo-pourpre.webp",
    alt: "AJ Luxury — Jérémy et Alex — Apollon Pourpre Impérial",
    crop: "duo",
    width: 2000,
    height: 1882,
  },
  {
    src: "/images/client/editorial-lilas-chair.webp",
    alt: "AJ Luxury — Jérémy — Apollon Lilas Céleste",
    crop: "portrait-right",
    width: 1731,
    height: 2600,
  },
] as const;

const productPresentation = [
  {
    slug: "pourpre",
    image: "/images/client/raw/product-card-pourpre.webp",
    alt: "AJ Luxury — Alex — Apollon Pourpre Impérial",
  },
  {
    slug: "rose-pale",
    image: "/images/client/raw/product-rose-profile.webp",
    alt: "AJ Luxury — Jérémy — Apollon Rose Velours",
  },
  {
    slug: "lilas-bleu-clair",
    image: "/images/client/raw/product-lilas-model.webp",
    alt: "AJ Luxury — Alex — Apollon Lilas Céleste",
  },
] as const;

const productDetails = [
  {
    src: "/images/client/editorial-pourpre-chair.webp",
    alt: "AJ Luxury — Jérémy — Apollon Pourpre Impérial",
    crop: "portrait-left",
    width: 1864,
    height: 2600,
  },
  {
    src: "/images/client/campaign-duo-lilas-seated.webp",
    alt: "AJ Luxury — Alex et Jérémy — Apollon Lilas Céleste",
    crop: "duo",
    width: 1484,
    height: 2229,
  },
  {
    src: "/images/client/editorial-rose-profile.webp",
    alt: "AJ Luxury — Alex — Apollon Rose Velours",
    crop: "portrait-right",
    width: 1731,
    height: 2600,
  },
] as const;

export default function Home() {
  const products = getProducts();
  const displayedProducts = productPresentation.flatMap((presentation) => {
    const product = products.find(({ slug }) => slug === presentation.slug);
    return product ? [{ product, ...presentation }] : [];
  });

  return (
    <main className={`aj-home ${styles.home}`}>
      <StoreHeader />

      <section className="aj-film" id="accueil" aria-label="AJ Luxury">
        <StaticProductionHero />
        <div className="aj-film__grade" aria-hidden="true" />

        <div className="aj-film__signature">
          <p>Reveal Your Inner Beauty</p>
          <a href="#apollon">
            <T id="hero.discover" /> <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      <HomeChromaticBridge />

      <section
        className="aj-featured"
        id="apollon"
        data-bridge-motion="scroll"
      >
        <div className="aj-featured__chromatic-flow" aria-hidden="true" />
        <div className="aj-featured__metal" aria-hidden="true">
          <DeferredMetallicField motion="still" variant="silver" />
        </div>
        <div className="aj-featured__glow" aria-hidden="true" />
        <div
          className="aj-featured__editorial"
          aria-label="AJ Luxury — Alex, Jérémy et Alex — Apollon"
        >
          {featuredEditorialImages.map((image, index) => (
            <figure
              className={`aj-featured__image aj-featured__image--${image.crop}${
                index === 1 ? " aj-featured__image--lead" : ""
              }`}
              key={image.src}
            >
              <img
                src={image.src}
                alt={image.alt}
                width={image.width}
                height={image.height}
                loading="lazy"
                fetchPriority="low"
                decoding="async"
                sizes="(max-width: 760px) 78vw, 31vw"
              />
            </figure>
          ))}
        </div>
      </section>

      <section className="aj-shop" id="collection">
        <div className="aj-shop__heading">
          <h2>Apollon</h2>
          <Link href="/shop">
            <T id="home.viewBoutique" />
          </Link>
        </div>

        <div className="aj-shop__rail">
          {displayedProducts.map(({ product, image, alt }) => (
            <article className="aj-product-card" key={product.slug}>
              <Link
                className="aj-product-card__image"
                href={`/products/${product.slug}`}
              >
                <img
                  src={image}
                  alt={alt}
                  width={1731}
                  height={2600}
                  loading="lazy"
                  fetchPriority="low"
                  decoding="async"
                  sizes="(max-width: 760px) 78vw, 31vw"
                />
              </Link>
              <div className="aj-product-card__caption">
                <div>
                  <p>{product.model}</p>
                  <h3>{product.name}</h3>
                </div>
                <Link href={`/products/${product.slug}`}>
                  <T id="shop.discover" /> ↗
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="aj-moodboard" aria-label="AJ Luxury — Jérémy et Alex">
        <div className="aj-moodboard__track">
          {productDetails.map((image) => (
            <figure
              className={`aj-moodboard__item aj-moodboard__item--${image.crop}`}
              key={image.src}
            >
              <img
                src={image.src}
                alt={image.alt}
                width={image.width}
                height={image.height}
                loading="lazy"
                fetchPriority="low"
                decoding="async"
                sizes="(max-width: 760px) 78vw, 31vw"
              />
            </figure>
          ))}
        </div>
      </section>

      <section className="aj-story" id="histoire">
        <div className="aj-story__metal" aria-hidden="true">
          <DeferredMetallicField motion="slow" variant="dusk" />
        </div>
        <div className="aj-story__copy">
          <div>
            <p>
              <ClientCopyText copyKey="brandStory" />
            </p>
            <div className="aj-story__actions">
              <Link href="/notre-histoire">
                <T id="home.discoverStory" />
              </Link>
              <Link href="/shop">
                <T id="story.discoverCollection" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <StoreFooter />
    </main>
  );
}
