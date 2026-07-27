import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getProducts } from "../../lib/products";
import MetallicField from "../components/MetallicField";
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
        <div className={styles.introMetal} aria-hidden="true">
          <MetallicField motion="slow" variant="silver" />
        </div>
        <div className={styles.introCopy}>
          <p className={styles.eyebrow}>Boutique</p>
          <h1 id="shop-title">Apollon</h1>
          <p className={styles.meta}>{products.length} coloris</p>
        </div>
      </section>

      <section className={styles.collection} aria-label="Les coloris Apollon">
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
            </article>
          ))}
        </div>
      </section>
      <StoreFooter />
    </main>
  );
}
