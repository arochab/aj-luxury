/* eslint-disable @next/next/no-img-element -- pre-optimized client-owned media avoids an unnecessary image runtime */

import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductGalleryZoom, {
  AjScrollReveal,
} from "../../components/ProductGalleryZoom";
import ProductPurchase from "../../components/ProductPurchase";
import LocalizedPrice from "../../components/LocalizedPrice";
import StoreFooter from "../../components/StoreFooter";
import StoreHeader from "../../components/StoreHeader";
import styles from "../../components/ProductPage.module.css";
import { getPublicStockBySize } from "../../../lib/commerce/internal-stock";
import { getProduct, getProducts } from "../../../lib/products";
import { T } from "../../../lib/i18n/TranslatedText";
import { getServerCommerceRuntimeMode } from "../../../lib/commerce/commerce-runtime.server";

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
  const runtimeMode = getServerCommerceRuntimeMode();
  const otherProducts = products.filter((item) => item.slug !== product.slug);

  return (
    <main
      className={styles.page}
      /* L'accent du coloris courant descend du swatch produit et sert au
         filet actif du panneau d'achat. Jamais une couleur inventée. */
      style={{ "--pdp-accent": product.swatch } as CSSProperties}
    >
      <StoreHeader />

      {/* display:contents — la scène n'est qu'une portée de sélecteurs GSAP. */}
      <AjScrollReveal className={styles.scene}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/"><T id="nav.home" /></Link>
          <span aria-hidden="true">/</span>
          <Link href="/shop"><T id="common.collection" /></Link>
          <span aria-hidden="true">/</span>
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
            runtimeMode={runtimeMode}
          />
        </section>

        <section
          className={styles.otherColors}
          aria-labelledby="autres-coloris"
        >
          <div className={styles.otherColorsHeader} data-aj-reveal>
            <p className={styles.eyebrow}><T id="shop.title" /></p>
            <h2 id="autres-coloris"><T id="common.discoverAlso" /></h2>
          </div>

          <div className={styles.otherColorsGrid}>
            {otherProducts.map((item) => (
              <Link
                className={styles.otherColor}
                href={`/products/${item.slug}`}
                key={item.slug}
                data-aj-reveal
                style={{ "--pdp-accent": item.swatch } as CSSProperties}
              >
                <span className={styles.otherColorImage}>
                  <span className={styles.otherColorMedia}>
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
                  </span>
                  <span className={styles.otherColorFilet} aria-hidden="true" />
                </span>

                <span className={styles.otherColorLine}>
                  <span className={`${styles.otherColorName} aj-metal`}>
                    {item.name}
                  </span>
                  <span className={styles.otherColorPrice}>
                    <LocalizedPrice amountCents={item.priceCents} />
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </AjScrollReveal>

      <StoreFooter />
    </main>
  );
}
