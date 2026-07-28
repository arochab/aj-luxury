import Image from "next/image";
import Link from "next/link";
import MetallicField from "./components/MetallicField";
import HeroComposition from "./components/HeroComposition";
import StoreFooter from "./components/StoreFooter";
import StoreHeader from "./components/StoreHeader";
import ClientCopyText from "./components/ClientCopyText";
import { T } from "../lib/i18n/TranslatedText";
import { getProducts } from "../lib/products";
import { editorialMoodboardImages } from "../lib/editorial-moodboard";

const featuredEditorialImages = [
  {
    src: "/images/client/editorial-lilas-chair.webp",
    alt: "Jérémy portant Apollon Lilas Céleste, assis",
  },
  {
    src: "/images/client/campaign-duo-lilas-seated.webp",
    alt: "Jérémy et Alex portant Apollon Lilas Céleste",
  },
  {
    src: "/images/client/hero-pourpre-model.webp",
    alt: "Alex portant Apollon Pourpre Impérial",
  },
];

export default function Home() {
  const products = getProducts();

  return (
    <main className="aj-home">
      <section className="aj-film" id="accueil" aria-label="Introduction AJ Luxury">
        <StoreHeader />
        <HeroComposition />
        <div className="aj-film__grade" aria-hidden="true" />

        <div className="aj-film__signature">
          <p>Reveal Your Inner Beauty</p>
          <a href="#apollon" aria-label="Découvrir Apollon">
            <T id="hero.discover" /> <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      <div className="aj-section-break" aria-hidden="true" />

      <section className="aj-featured" id="apollon">
        <div className="aj-featured__metal" aria-hidden="true">
          <MetallicField motion="still" variant="silver" />
        </div>
        <div className="aj-featured__glow" aria-hidden="true" />
        <div
          className="aj-featured__editorial"
          aria-label="Éditorial AJ Luxury avec Jérémy et Alex"
        >
          {featuredEditorialImages.map((image, index) => (
            <figure
              className={`aj-featured__image${index === 1 ? " aj-featured__image--lead" : ""}`}
              key={image.src}
            >
              <Image
                unoptimized
                src={image.src}
                alt={image.alt}
                fill
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
                <Image
                  unoptimized
                  src={product.image}
                  alt={`${product.model}, coloris ${product.name}, porté par un mannequin adulte`}
                  fill
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

      <section className="aj-moodboard" aria-label="Campagne AJ Luxury avec les deux mannequins">
        <div className="aj-moodboard__track">
          {editorialMoodboardImages.map((image) => (
            <figure className="aj-moodboard__item" key={image.src}>
              <Image
                unoptimized
                src={image.src}
                alt={image.alt}
                fill
                sizes="(max-width: 760px) 74vw, 46vw"
              />
            </figure>
          ))}
        </div>
      </section>

      <section className="aj-story" id="histoire">
        <div className="aj-story__metal" aria-hidden="true">
          <MetallicField motion="slow" variant="dusk" />
        </div>
        <div className="aj-story__copy">
          <div>
            <p>
              <ClientCopyText copyKey="brandStory" />
            </p>
            <Link href="/notre-histoire">
              <T id="home.discoverStory" />
            </Link>
          </div>
        </div>
      </section>

      <StoreFooter />
    </main>
  );
}
