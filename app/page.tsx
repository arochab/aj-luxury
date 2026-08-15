/* eslint-disable @next/next/no-img-element -- pre-optimized client-owned media avoids an unnecessary image runtime */

import Link from "next/link";
import DeferredMetallicField from "./components/DeferredMetallicField";
import HeroComposition from "./components/HeroComposition";
import StoreFooter from "./components/StoreFooter";
import StoreHeader from "./components/StoreHeader";
import ClientCopyText from "./components/ClientCopyText";
import ApollonHorizontalRail from "./components/ApollonHorizontalRail";
import ExperienceMotionLayer from "./components/ExperienceMotionLayer";
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

const apollonEditorialImages = [
  {
    src: "/images/editorial/isabelle-apollon/apollon-rose-lyre-v1.webp",
    alt: "Apollon Rose Velours dans un décor de marbre, lyre, arc et flèches",
    name: "Rose Velours",
    number: "01",
    position: "rose",
  },
  {
    src: "/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1.webp",
    alt: "Apollon Lilas Céleste dans un décor de marbre, lyre, arc et flèches",
    name: "Lilas Céleste",
    number: "02",
    position: "lilas",
  },
  {
    src: "/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1.webp",
    alt: "Apollon Pourpre Impérial dans un décor de marbre, lyre, arc et flèches",
    name: "Pourpre Impérial",
    number: "03",
    position: "pourpre",
  },
];

export default function Home() {
  const products = getProducts();

  return (
    <main className="aj-home">
      <ExperienceMotionLayer />
      <section className="aj-film" id="accueil" aria-label="AJ Luxury">
        <StoreHeader />
        <h1 className="aj-film__portrait--sr">AJ Luxury — Reveal Your Inner Beauty</h1>
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

      <section className="aj-proof" aria-labelledby="apollon-proof-title">
        <p id="apollon-proof-title">Apollon 01</p>
        <dl>
          <div>
            <dt>94 %</dt>
            <dd><T id="home.materialModal" /></dd>
          </div>
          <div>
            <dt>6 %</dt>
            <dd><T id="home.materialElastane" /></dd>
          </div>
          <div>
            <dt>03</dt>
            <dd><T id="home.colors" /></dd>
          </div>
          <div>
            <dt>S—XL</dt>
            <dd><T id="home.sizes" /></dd>
          </div>
        </dl>
      </section>

      <section className="aj-apollon-myth" id="apollon">
        <ApollonHorizontalRail />
        <div className="aj-apollon-myth__sticky">
          <div className="aj-apollon-myth__rail">
            <header className="aj-apollon-myth__intro">
              <div>
                <p><T id="home.apollonEyebrow" /></p>
                <span aria-hidden="true">A</span>
              </div>
              <div>
                <h2><T id="home.apollonStatement" /></h2>
              </div>
            </header>

            <div className="aj-apollon-myth__gallery">
              {apollonEditorialImages.map((image) => (
                <figure
                  className={`aj-apollon-myth__card aj-apollon-myth__card--${image.position}`}
                  key={image.src}
                >
                  <div className="aj-apollon-myth__frame">
                    <img
                      src={image.src}
                      alt={image.alt}
                      width={1024}
                      height={1536}
                      loading="lazy"
                      fetchPriority="low"
                      decoding="async"
                      sizes="(max-width: 760px) 82vw, 36vw"
                    />
                  </div>
                  <figcaption>
                    <span>{image.number}</span>
                    <strong>{image.name}</strong>
                  </figcaption>
                </figure>
              ))}
            </div>

            <footer className="aj-apollon-myth__footer">
              <p><T id="product.feature.2" /></p>
              <Link href="/shop">
                <T id="story.discoverCollection" /> <span aria-hidden="true">↗</span>
              </Link>
            </footer>
          </div>
        </div>
      </section>

      <section className="aj-featured" id="campagne">
        <div className="aj-featured__metal" aria-hidden="true">
          <DeferredMetallicField motion="still" variant="silver" />
        </div>
        <div className="aj-featured__glow" aria-hidden="true" />
        <header className="aj-featured__bridge">
          <p><T id="home.incarnationEyebrow" /></p>
          <h2><T id="home.incarnationTitle" /></h2>
        </header>
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
              <Link
                aria-label={`${product.model} ${product.name}`}
                className="aj-product-card__image"
                href={`/products/${product.slug}`}
              >
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

      <section
        className="aj-moodboard"
        aria-label="Galerie de campagne AJ Luxury"
        aria-roledescription="carrousel"
        tabIndex={0}
      >
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
