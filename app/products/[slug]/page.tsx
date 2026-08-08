/* eslint-disable @next/next/no-img-element -- pre-optimized client-owned media avoids an unnecessary image runtime */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductGalleryZoom from "../../components/ProductGalleryZoom";
import ProductPurchase from "../../components/ProductPurchase";
import StoreFooter from "../../components/StoreFooter";
import StoreHeader from "../../components/StoreHeader";
import styles from "../../components/ProductPage.module.css";
import { getPublicStockBySize } from "../../../lib/commerce/internal-stock";
import { getProduct, getProducts } from "../../../lib/products";
import { T } from "../../../lib/i18n/TranslatedText";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return getProducts().map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);

  if (!product) return {};

  return {
    title: `${product.model} ${product.name} | AJ Luxury`,
    description: `${product.model}, coloris ${product.name}, 94% modal et 6% élasthanne.`,
    robots: { index: false, follow: false },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = getProduct(slug);
  const products = getProducts();

  if (!product) notFound();

  const availability = getPublicStockBySize(product.slug);
  const otherProducts = products.filter((item) => item.slug !== product.slug);

  return (
    <main className={styles.page}>
      <StoreHeader />

      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link href="/"><T id="nav.home" /></Link>
        <span>/</span>
        <Link href="/shop"><T id="common.collection" /></Link>
        <span>/</span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <section className={styles.hero}>
        <ProductGalleryZoom
          images={product.gallery}
          model={product.model}
          color={product.name}
        />

        <ProductPurchase
          product={product}
          products={products}
          availability={availability}
        />
      </section>

      <section className={styles.otherColors}>
        <div className={styles.otherColorsHeader}>
          <div>
            <p className={styles.eyebrow}><T id="shop.title" /></p>
            <h2><T id="common.discoverAlso" /></h2>
          </div>
        </div>
        <div className={styles.otherColorsGrid}>
          {otherProducts.map((item) => (
            <Link
              className={styles.otherColor}
              href={`/products/${item.slug}`}
              key={item.slug}
            >
              <div className={styles.otherColorImage}>
                <img
                  src={item.image}
                  alt={`${item.model} ${item.name}`}
                  width={1600}
                  height={2000}
                  loading="lazy"
                  fetchPriority="low"
                  decoding="async"
                  sizes="(max-width: 760px) 100vw, 33vw"
                />
              </div>
              <span>{item.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <StoreFooter />
    </main>
  );
}
