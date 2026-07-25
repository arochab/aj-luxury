import Image from "next/image";
import Link from "next/link";
import MetallicField from "./components/MetallicField";
import ProceduralDuo from "./components/ProceduralDuo";
import StoreFooter from "./components/StoreFooter";
import StoreHeader from "./components/StoreHeader";
import { getProducts } from "../lib/products";

const editorialImages = [
  {
    src: "/images/client/hero-pourpre-model.webp",
    alt: "Apollon Pourpre Impérial porté par un mannequin",
    className: "aj-moodboard__item--wide",
  },
  {
    src: "/images/client/editorial-lilas-chair.webp",
    alt: "Apollon Lilas Céleste porté dans une composition éditoriale",
    className: "aj-moodboard__item--portrait",
  },
  {
    src: "/images/client/editorial-pourpre-chair.webp",
    alt: "Apollon Pourpre Impérial dans une composition éditoriale",
    className: "aj-moodboard__item--tall",
  },
  {
    src: "/images/client/product-rose-front.webp",
    alt: "Boxer Apollon Rose Velours porté, vue de face",
    className: "aj-moodboard__item--portrait",
  },
  {
    src: "/images/client/product-lilas-back.webp",
    alt: "Boxer Apollon Lilas Céleste porté, vue arrière",
    className: "aj-moodboard__item--wide",
  },
];

export default function Home() {
  const products = getProducts();

  return (
    <main className="aj-home">
      <section className="aj-film" id="accueil" aria-label="Introduction AJ Luxury">
        <StoreHeader />
        <div className="aj-film__metal" aria-hidden="true">
        </div>
        <div className="aj-film__hero-video" aria-hidden="true">
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
          >
            <source src="/videos/aj-luxury-hero-loop.mp4" type="video/mp4" />
          </video>
        </div>
        <ProceduralDuo />
        <div className="aj-film__liquid-overlay" aria-hidden="true">
          <MetallicField />
        </div>
        <div className="aj-film__grade" aria-hidden="true" />

        <div className="aj-film__signature">
          <p>Reveal Your Inner Beauty</p>
          <a href="#apollon" aria-label="Découvrir Apollon">
            Découvrir <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      <section className="aj-featured" id="apollon">
        <div className="aj-featured__metal" aria-hidden="true">
          <MetallicField />
        </div>
        <div className="aj-featured__glow" aria-hidden="true" />
        <Link className="aj-featured__card" href="/products/pourpre">
          <div className="aj-featured__image">
            <Image
              unoptimized
              src="/images/client/product-pourpre-front.webp"
              alt="Boxer Apollon Pourpre Impérial porté"
              fill
              sizes="(max-width: 760px) 86vw, 40vw"
            />
          </div>
          <div className="aj-featured__caption">
            <h1>Apollon</h1>
            <strong>Découvrir ↗</strong>
          </div>
        </Link>
      </section>

      <section className="aj-shop" id="collection">
        <div className="aj-shop__heading">
          <h2>Apollon</h2>
          <p>Un modèle décliné en trois coloris.</p>
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

      <section className="aj-duo" aria-label="Les deux mannequins AJ Luxury">
        <figure>
          <Image
            unoptimized
            src="/images/client/campaign-duo-lilas-seated.webp"
            alt="Les deux mannequins portant Apollon Lilas Céleste"
            fill
            sizes="(max-width: 760px) 100vw, 50vw"
          />
        </figure>
        <figure>
          <Image
            unoptimized
            src="/images/client/campaign-duo-lilas-close.webp"
            alt="Les deux mannequins portant Apollon Lilas Céleste, cadrage rapproché"
            fill
            sizes="(max-width: 760px) 100vw, 50vw"
          />
        </figure>
      </section>

      <section className="aj-detail" id="matiere">
        <figure className="aj-detail__visual">
          <Image
            unoptimized
            src="/images/client/product-pourpre-detail.webp"
            alt="Détail de la ceinture premium et du logo métallique AJ Luxury"
            fill
            sizes="(max-width: 760px) 100vw, 63vw"
          />
        </figure>

        <div className="aj-detail__copy">
          <p className="aj-detail__eyebrow">Apollon</p>
          <h2>94% modal<br />6% élasthanne</h2>
          <p>
            Une matière douce, légère et respirante, pensée pour offrir une
            sensation de seconde peau.
          </p>
          <dl>
            <div>
              <dt>Ceinture</dt>
              <dd>3,5 cm</dd>
            </div>
            <div>
              <dt>Tailles</dt>
              <dd>S à XL</dd>
            </div>
            <div>
              <dt>Signature</dt>
              <dd>Logo métallique AJ Luxury</dd>
            </div>
          </dl>
          <Link href="/products/pourpre">Voir le produit</Link>
        </div>
      </section>

      <section className="aj-story" id="histoire">
        <div className="aj-story__metal" aria-hidden="true">
          <MetallicField />
        </div>
        <div className="aj-story__copy">
          <p>
            Chez AJ Luxury, nous sommes convaincus que le véritable luxe
            commence par ce que l’on porte au plus près de soi.
          </p>
          <span>Reveal Your Inner Beauty</span>
        </div>
      </section>

      <StoreFooter />
    </main>
  );
}
