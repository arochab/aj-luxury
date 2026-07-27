import Image from "next/image";
import Link from "next/link";
import MetallicField from "./components/MetallicField";
import HeroComposition from "./components/HeroComposition";
import StoreFooter from "./components/StoreFooter";
import StoreHeader from "./components/StoreHeader";
import { getProducts } from "../lib/products";

const editorialImages = [
  {
    src: "/images/client/editorial-pourpre-chair.webp",
    alt: "Apollon Pourpre Impérial porté par Jérémy",
    className: "aj-moodboard__item--wide",
  },
  {
    src: "/images/client/hero-pourpre-model.webp",
    alt: "Apollon Pourpre Impérial porté par Alex",
    className: "aj-moodboard__item--portrait",
  },
  {
    src: "/images/client/campaign-duo-lilas-seated.webp",
    alt: "Jérémy et Alex portant Apollon Lilas Céleste",
    className: "aj-moodboard__item--tall",
  },
  {
    src: "/images/client/editorial-lilas-chair.webp",
    alt: "Apollon Lilas Céleste porté par Jérémy",
    className: "aj-moodboard__item--portrait",
  },
  {
    src: "/images/client/editorial-rose-profile.webp",
    alt: "Apollon Rose Velours porté par Alex",
    className: "aj-moodboard__item--wide",
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
            Découvrir <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      <div className="aj-section-break" aria-hidden="true" />

      <section className="aj-featured" id="apollon">
        <div className="aj-featured__metal" aria-hidden="true">
          <MetallicField motion="still" variant="silver" />
        </div>
        <div className="aj-featured__glow" aria-hidden="true" />
        <figure className="aj-featured__editorial">
          <div className="aj-featured__image">
            <Image
              unoptimized
              src="/images/client/raw/product-pourpre-front.webp"
              alt="Apollon Pourpre Impérial dans une composition éditoriale"
              fill
              sizes="(max-width: 760px) 86vw, 40vw"
            />
          </div>
        </figure>
      </section>

      <section className="aj-shop" id="collection">
        <div className="aj-shop__heading">
          <h2>Apollon</h2>
          <Link href="/shop">Voir toute la boutique</Link>
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
                <Link href={`/products/${product.slug}`}>Découvrir ↗</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="aj-moodboard" aria-label="Campagne AJ Luxury avec les deux mannequins">
        <div className="aj-moodboard__track">
          {editorialImages.map((image) => (
            <figure className={`aj-moodboard__item ${image.className}`} key={image.src}>
              <Image unoptimized src={image.src} alt={image.alt} fill sizes="46vw" />
            </figure>
          ))}
        </div>
      </section>

      <section className="aj-story" id="histoire">
        <div className="aj-story__metal" aria-hidden="true">
          <MetallicField motion="slow" variant="dusk" />
        </div>
        <div className="aj-story__copy">
          <p>
            Chez AJ Luxury, nous sommes convaincus que le véritable luxe
            commence par ce que l’on porte au plus près de soi.
          </p>
        </div>
      </section>

      <StoreFooter />
    </main>
  );
}
