"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Product, ProductSize } from "../../lib/products";
import { formatPrice, sizes } from "../../lib/products";
import styles from "./ProductPage.module.css";

type ProductPurchaseProps = {
  product: Product;
  products: Product[];
};

export default function ProductPurchase({
  product,
  products,
}: ProductPurchaseProps) {
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [added, setAdded] = useState(false);
  const { locale, t } = useI18n();

  function selectSize(size: ProductSize) {
    setSelectedSize(size);
    setAdded(false);
  }

  return (
    <aside
      className={styles.purchasePanel}
      aria-label={t("product.purchaseInfoLabel")}
    >
      <p className={styles.eyebrow}>{product.statusLabel}</p>
      <h1>{product.model}</h1>
      <p className={styles.colorName}>{product.name}</p>

      <div className={styles.price}>
        <strong>{formatPrice(product.priceCents, locale)}</strong>
        <span>{t("product.priceLabel")}</span>
      </div>

      <p className={styles.description} lang="fr">
        {product.description}
      </p>

      <div className={styles.selector}>
        <div className={styles.selectorHeading}>
          <span>{t("product.color")}</span>
          <strong>{product.color}</strong>
        </div>
        <div className={styles.variantOptions}>
          {products.map((variant) => (
            <Link
              className={`${styles.variant} ${
                variant.slug === product.slug ? styles.variantActive : ""
              }`}
              href={`/products/${variant.slug}`}
              key={variant.slug}
              aria-current={variant.slug === product.slug ? "page" : undefined}
            >
              <span
                className={styles.swatch}
                style={{ backgroundColor: variant.swatch }}
                aria-hidden="true"
              />
              <span>{variant.name}</span>
            </Link>
          ))}
        </div>
      </div>

      <fieldset className={styles.selector}>
        <legend className={styles.selectorHeading}>
          <span>{t("product.selectSize")}</span>
          <a href="#guide-tailles">{t("product.sizeGuide")}</a>
        </legend>
        <div className={styles.sizeOptions}>
          {sizes.map((size) => (
            <button
              className={styles.sizeButton}
              type="button"
              key={size}
              aria-pressed={selectedSize === size}
              aria-label={`${t("product.size")} ${size}, ${product.inventory[size]} ${t("product.inStock")}`}
              onClick={() => selectSize(size)}
            >
              {size}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        className={styles.purchaseButton}
        type="button"
        disabled={!selectedSize}
        onClick={() => setAdded(true)}
      >
        {added
          ? `${t("product.added")} · ${t("product.size")} ${selectedSize}`
          : selectedSize
            ? t("product.addDemo")
            : t("product.selectSizePrompt")}
      </button>

      <p className={styles.notice} role="status" aria-live="polite">
        {added
          ? t("product.demoAdded")
          : t("product.paymentDisabled")}
      </p>

      {added && (
        <Link
          className={styles.cartLink}
          href={`/cart?variant=variant_boxer_${product.slug}_${selectedSize?.toLowerCase()}`}
        >
          {t("product.viewCart")}
        </Link>
      )}

      <div className={styles.details}>
        <details>
          <summary>{t("product.fullDescription")}</summary>
          <div className={styles.detailsContent} lang="fr">
            {product.details.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </details>

        <details open>
          <summary>{t("product.features")}</summary>
          <div className={styles.detailsContent} lang="fr">
            <ul className={styles.featureList}>
              {product.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>
        </details>

        <details id="guide-tailles">
          <summary>{t("product.sizesAvailability")}</summary>
          <div className={styles.detailsContent}>
            <ul className={styles.stockList}>
              {sizes.map((size) => (
                <li key={size}>
                  <strong>{size}</strong>
                  <span>
                    {product.inventory[size]} {t("product.inStock")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      </div>

      <div className={styles.service}>
        <span>{t("product.shippingPending")}</span>
        <span>{t("product.paymentPending")}</span>
        <span>{t("product.returnsPending")}</span>
      </div>
    </aside>
  );
}
