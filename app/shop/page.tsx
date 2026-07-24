import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getProducts, sizes } from "../../lib/products";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import styles from "./Shop.module.css";

export const metadata: Metadata = {
  title: "Boutique | AJ Luxury",
  description:
    "Découvrez Apollon, le boxer AJ Luxury décliné en Pourpre Impérial, Rose Velours et Lilas Céleste.",
};

export default function ShopPage() {
  const products = getProducts();

  return (
    <main className={styles.shop}>
      <StoreHeader />
      <section className={styles.intro} aria-labelledby="shop-title">
        <div className={styles.introTopline}>
          <p>AJ Luxury</p>
          <p>{products.length} coloris</p>
        </div>

        <div className={styles.introCopy}>
          <p className={styles.eyebrow}>Collection Apollon</p>
          <h1 id="shop-title">Boutique</h1>
          <p className={styles.lede}>
            Le modèle Apollon est décliné en trois coloris. Sa coupe boxer
            classique en 94&nbsp;% modal et 6&nbsp;% élasthanne est disponible
            du S au XL.
          </p>
        </div>
      </section>

      <nav className={styles.catalogBar} aria-label="Navigation du catalogue">
        <p>
          <span>Collection</span>
          <strong>Apollon</strong>
        </p>
        <ul>
          {products.map((product) => (
            <li key={product.slug}>
              <a href={`#${product.slug}`}>
                <span
                  className={styles.swatch}
                  style={{ backgroundColor: product.swatch }}
                  aria-hidden="true"
                />
                {product.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section className={styles.collection} aria-labelledby="collection-title">
        <header className={styles.collectionHeader}>
          <div>
            <p className={styles.eyebrow}>Le modèle Apollon</p>
            <h2 id="collection-title">Les trois coloris</h2>
          </div>
          <p>{products.length} produits</p>
        </header>

        <div className={styles.productGrid}>
          {products.map((product, index) => (
            <article
              className={styles.productCard}
              id={product.slug}
              key={product.slug}
            >
              <Link
                className={styles.productVisual}
                href={`/products/${product.slug}`}
                aria-label={`Découvrir Apollon ${product.name}`}
              >
                <Image
                  unoptimized
                  src={product.image}
                  alt={`Boxer Apollon, coloris ${product.name}`}
                  fill
                  sizes="(max-width: 760px) 100vw, 33vw"
                  priority={index === 0}
                />
                <span className={styles.cardIndex}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.discover}>Découvrir</span>
              </Link>

              <div className={styles.productDetails}>
                <div>
                  <p className={styles.model}>{product.model}</p>
                  <h3>
                    <Link href={`/products/${product.slug}`}>
                      {product.name}
                    </Link>
                  </h3>
                  <p className={styles.tone}>{product.tone}</p>
                </div>
                <span
                  className={styles.detailSwatch}
                  style={{ backgroundColor: product.swatch }}
                  aria-label={`Coloris ${product.name}`}
                />
              </div>

              <dl className={styles.specifications}>
                <div>
                  <dt>Matière</dt>
                  <dd>94 % modal, 6 % élasthanne</dd>
                </div>
                <div>
                  <dt>Tailles</dt>
                  <dd>{sizes.join(" · ")}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.material} aria-label="Matière et finition">
        <p className={styles.materialNumber}>94 % modal</p>
        <div>
          <p className={styles.eyebrow}>La matière</p>
          <h2>Modal et élasthanne</h2>
          <p>
            Un toucher doux et soyeux, une matière respirante et une ceinture
            premium de 3,5&nbsp;cm ornée du logo métallique AJ Luxury.
          </p>
        </div>
        <Link href="/#matiere">Découvrir la matière</Link>
      </section>
      <StoreFooter />
    </main>
  );
}
