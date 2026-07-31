import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getProducts } from "../../lib/products";
import MetallicField from "../components/MetallicField";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";
import LocalizedProductText from "../components/LocalizedProductText";
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
          <p className={styles.eyebrow}>
            <T id="nav.shop" />
          </p>
          <h1 id="shop-title">Apollon</h1>
          <p className={styles.meta}>
            <T id="common.colorCount" values={{ count: products.length }} />
          </p>
        </div>
      </section>

      <section className={styles.collection} aria-labelledby="shop-title">
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
                aria-label={`${product.model} ${product.name}`}
              >
                <Image
                  unoptimized
                  src={product.image}
                  alt={`${product.model} ${product.name}`}
                  fill
                  sizes="(max-width: 760px) 100vw, 33vw"
                  priority={index === 0}
                />
                <span className={styles.discover}>
                  <T id="shop.discover" />
                </span>
              </Link>

              <div className={styles.productDetails}>
                <div>
                  <p className={styles.model}>{product.model}</p>
                  <h3>
                    <Link href={`/products/${product.slug}`}>
                      {product.name}
                    </Link>
                  </h3>
                  <p className={styles.tone}>
                    <LocalizedProductText slug={product.slug} field="tone" />
                  </p>
                </div>
                <span
                  className={styles.detailSwatch}
                  style={{ backgroundColor: product.swatch }}
                  aria-hidden="true"
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
