/* eslint-disable @next/next/no-img-element -- pre-optimized client-owned media avoids an unnecessary image runtime */

import Link from "next/link";
import DeferredMetallicField from "./components/DeferredMetallicField";
import HeroComposition from "./components/HeroComposition";
import StoreFooter from "./components/StoreFooter";
import StoreHeader from "./components/StoreHeader";
import ClientCopyText from "./components/ClientCopyText";
import ApollonGuidedSequence from "./components/ApollonGuidedSequence";
import ExperienceMotionLayer from "./components/ExperienceMotionLayer";
import { T } from "../lib/i18n/TranslatedText";
import { formatPrice, getProducts } from "../lib/products";
import { editorialMoodboardImages } from "../lib/editorial-moodboard";

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
        <p id="apollon-proof-title">
          Apollon 01 · {formatPrice(products[0].priceCents)}
        </p>
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

      <ApollonGuidedSequence />

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
                  <span className="aj-product-card__price">
                    {formatPrice(product.priceCents)}
                  </span>
                </div>
                <Link href={`/products/${product.slug}`}>
                  <T id="shop.discover" /> ↗
                </Link>
              </div>
            </article>
          ))}
        </div>
        <div className="aj-shop__close">
          <p>
            94 % <T id="home.materialModal" /> · 03 <T id="home.colors" /> · S—XL <T id="home.sizes" />
          </p>
          <Link href="/shop"><T id="story.discoverCollection" /> →</Link>
        </div>
      </section>

      <section
        className="aj-moodboard"
        aria-labelledby="aj-campaign-title"
        tabIndex={0}
      >
        <h2 className="aj-film__portrait--sr" id="aj-campaign-title"><T id="home.incarnationEyebrow" /></h2>
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
        <div className="aj-moodboard__progress" aria-hidden="true"><span /></div>
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
