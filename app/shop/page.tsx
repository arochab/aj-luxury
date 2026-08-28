/* eslint-disable @next/next/no-img-element -- static responsive derivatives
   avoid a runtime optimizer and keep the three collection cards deterministic. */
import type { Metadata } from "next";
import Link from "next/link";
import {
  AJ_APOLLON_PACK_PRICE_CENTS,
  AJ_APOLLON_UNIT_PRICE_CENTS,
} from "../../lib/commerce/pack-pricing";
import {
  isServerCommerceReview,
} from "../../lib/commerce/commerce-runtime.server";
import { getProducts } from "../../lib/products";
import LocalizedPrice from "../components/LocalizedPrice";
import LocalizedProductText from "../components/LocalizedProductText";
import MetallicField from "../components/MetallicField";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";
import PackSaving from "./PackSaving";
import styles from "./Shop.module.css";

export const metadata: Metadata = {
  title: "Boutique | AJ Luxury",
  description:
    "Découvrez Apollon, le boxer AJ Luxury décliné en Pourpre Impérial, Rose Velours et Lilas Céleste.",
};

const OFFERS = [
  {
    count: 1,
    labelKey: "product.unitOffer",
    detailKey: "product.unitDetail",
    priceCents: AJ_APOLLON_PACK_PRICE_CENTS[1],
    savingCents: null,
    savingPercent: null,
  },
  {
    count: 2,
    labelKey: "product.duoOffer",
    detailKey: "product.duoDetail",
    priceCents: AJ_APOLLON_PACK_PRICE_CENTS[2],
    savingCents:
      AJ_APOLLON_UNIT_PRICE_CENTS * 2 - AJ_APOLLON_PACK_PRICE_CENTS[2],
    savingPercent: "16,66 %",
  },
  {
    count: 3,
    labelKey: "product.trioOffer",
    detailKey: "product.trioDetail",
    priceCents: AJ_APOLLON_PACK_PRICE_CENTS[3],
    savingCents:
      AJ_APOLLON_UNIT_PRICE_CENTS * 3 - AJ_APOLLON_PACK_PRICE_CENTS[3],
    savingPercent: "22,21 %",
  },
] as const;

const PRODUCTION_ORDER = ["pourpre", "rose-pale", "lilas-bleu-clair"] as const;

const PRODUCTION_IMAGES: Readonly<Record<(typeof PRODUCTION_ORDER)[number], string>> =
  Object.freeze({
    pourpre: "/images/client/raw/product-card-pourpre.webp",
    "rose-pale": "/images/client/raw/product-rose-profile.webp",
    "lilas-bleu-clair": "/images/client/raw/product-lilas-model.webp",
  });

function productSrcSet(src: string) {
  const variant = (width: 480 | 960) => src.replace(/\.webp$/, `-${width}.webp`);
  return `${variant(480)} 480w, ${variant(960)} 960w, ${src} 1731w`;
}

export default function ShopPage() {
  const catalog = getProducts();
  const products = PRODUCTION_ORDER.flatMap((slug) => {
    const product = catalog.find((candidate) => candidate.slug === slug);
    return product
      ? [{ ...product, image: PRODUCTION_IMAGES[slug] }]
      : [];
  });
  const reviewMode = isServerCommerceReview();

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

      {reviewMode && (
        <aside className={styles.releaseNote} aria-label="Commerce AJ Luxury">
          <T id="shop.reviewNotice" />
        </aside>
      )}

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
                <img
                  src={product.image}
                  srcSet={productSrcSet(product.image)}
                  alt={`${product.model} ${product.name}`}
                  width={1731}
                  height={2600}
                  sizes="(max-width: 760px) 100vw, 33vw"
                  loading="eager"
                  fetchPriority={index === 0 ? "high" : "auto"}
                  decoding="async"
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

      <section className={styles.packSection} aria-labelledby="packs-title">
        <div className={styles.packIntro}>
          <p className={styles.eyebrow}>
            <T id="product.chooseOffer" />
          </p>
          <h2 id="packs-title">
            <T id="product.duoOffer" /> <span aria-hidden="true">&amp;</span>{" "}
            <T id="product.trioOffer" />
          </h2>
          <p className={styles.packExplanation}>
            <strong>
              <T id="product.sameColorPack" />
            </strong>{" "}
            <T id="product.sameColorPackBody" />{" "}
            <strong>
              <T id="product.mixedColorPack" />
            </strong>{" "}
            <T id="product.mixedColorPackBody" />
          </p>
        </div>

        <div className={styles.packLedger}>
          {OFFERS.map((offer) => (
            <article className={styles.packLine} key={offer.count}>
              <div>
                <h3>
                  <T id={offer.labelKey} />
                </h3>
                <p>
                  <T id={offer.detailKey} />
                </p>
              </div>
              <p className={styles.packPrice}>
                <LocalizedPrice amountCents={offer.priceCents} />
              </p>
              {offer.savingCents !== null && offer.savingPercent !== null && (
                <p className={styles.packSaving}>
                  <PackSaving
                    amountCents={offer.savingCents}
                    percent={offer.savingPercent}
                  />
                </p>
              )}
            </article>
          ))}

          <Link
            className={styles.packAction}
            href={`/products/${products[0]?.slug ?? "rose-pale"}`}
          >
            <T id="shop.discover" />
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <StoreFooter />
    </main>
  );
}
