/* eslint-disable @next/next/no-img-element -- pre-optimized client-owned media avoids an unnecessary image runtime */

import Link from "next/link";
import DeferredMetallicField from "./components/DeferredMetallicField";
import HeroComposition from "./components/HeroComposition";
import StoreFooter from "./components/StoreFooter";
import StoreHeader from "./components/StoreHeader";
import ClientCopyText from "./components/ClientCopyText";
import { T } from "../lib/i18n/TranslatedText";
import { getProducts } from "../lib/products";
import { editorialMoodboardImages } from "../lib/editorial-moodboard";

const featuredEditorialImages = [
  {
    src: "/images/client/product-rose-model.webp",
    alt: "AJ Luxury — Alex — Apollon Rose Velours",
    crop: "portrait-left",
  },
  {
    src: "/images/client/campaign-duo-pourpre.webp",
    alt: "AJ Luxury — Jérémy et Alex — Apollon Pourpre Impérial",
    crop: "duo",
  },
  {
    src: "/images/client/editorial-lilas-chair.webp",
    alt: "AJ Luxury — Jérémy — Apollon Lilas Céleste",
    crop: "portrait-right",
  },
];

export default function Home() {
  const products = getProducts();

  return (
    <main className="aj-home">
      <section className="aj-film" id="accueil" aria-label="AJ Luxury">
        <StoreHeader />
        <HeroComposition />
        <div className="aj-film__grade" aria-hidden="true" />

        <div className="aj-film__signature">
          <p>Reveal Your Inner Beauty</p>
          <a href="#apollon">
            <T id="hero.discover" /> <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      <div className="aj-section-break" aria-hidden="true" />

      <section className="aj-featured" id="apollon">
        <div className="aj-featured__metal" aria-hidden="true">
          <DeferredMetallicField motion="still" variant="silver" />
        </div>
        <div className="aj-featured__glow" aria-hidden="true" />
        <div
          className="aj-featured__editorial"
          aria-label="AJ Luxury — Alex, Jérémy — Apollon"
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
                width={1600}
                height={2400}
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
          {products.map((product) => (
            <article className="aj-product-card" key={product.slug}>
              <Link className="aj-product-card__image" href={`/products/${product.slug}`}>
                <img
                  src={product.image}
                  alt={`${product.model} ${product.name}`}
                  width={1600}
                  height={2000}
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

      <section className="aj-moodboard" aria-label="AJ Luxury — Jérémy, Alex">
        <div className="aj-moodboard__track">
          {editorialMoodboardImages.map((image) => (
            <figure
              className={`aj-moodboard__item aj-moodboard__item--${image.crop}`}
              key={image.src}
            >
              <img
                src={image.src}
                alt={image.alt}
                width={1600}
                height={2400}
                loading="lazy"
                fetchPriority="low"
                decoding="async"
                sizes="(max-width: 760px) 74vw, 46vw"
                style={
                  image.objectPosition
                    ? { objectPosition: image.objectPosition }
                    : undefined
                }
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
