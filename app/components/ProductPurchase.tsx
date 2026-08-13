"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { getLocalizedProductCopy } from "@/lib/i18n/product-copy";
import {
  CartApiError,
  ensureOpenCart,
  setCartLineQuantity,
} from "../../lib/commerce/preprod-cart-client";
import { createLaunchVariantId } from "../../lib/commerce/product-identifiers";
import type { PublicStockBySize } from "../../lib/commerce/public-stock";
import type { Product, ProductSize } from "../../lib/products";
import { formatPrice, sizes } from "../../lib/products";
import styles from "./ProductPage.module.css";

type ProductPurchaseProps = {
  product: Product;
  products: Product[];
  availability: PublicStockBySize;
};

export default function ProductPurchase({
  product,
  products,
  availability,
}: ProductPurchaseProps) {
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [feedback, setFeedback] = useState<
    | { kind: "success"; quantity: number; size: ProductSize }
    | { kind: "error"; code: string }
    | null
  >(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const sizeGuideDialog = useRef<HTMLDivElement>(null);
  const sizeGuideClose = useRef<HTMLButtonElement>(null);
  const sizeGuideTrigger = useRef<HTMLButtonElement>(null);
  const cartError = useRef<HTMLParagraphElement>(null);
  const cartRequestInFlight = useRef(false);
  const restoreSizeGuideFocus = useRef(false);
  const { locale, t } = useI18n();
  const localizedProduct = getLocalizedProductCopy(t, product.slug);

  function selectSize(size: ProductSize) {
    if (availability[size].state === "sold-out") return;

    setSelectedSize(size);
    setFeedback(null);
  }

  function stockLabel(size: ProductSize) {
    const stock = availability[size];

    if (stock.state === "sold-out") {
      return t("product.soldOut");
    }

    if (stock.state === "low-stock") {
      return t("product.lowStockSimulated");
    }

    return t("product.available");
  }

  useEffect(() => {
    if (!sizeGuideOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sizeGuideClose.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        restoreSizeGuideFocus.current = true;
        setSizeGuideOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const dialog = sizeGuideDialog.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], select, input, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [sizeGuideOpen]);

  useEffect(() => {
    if (sizeGuideOpen || !restoreSizeGuideFocus.current) return;

    const frame = window.requestAnimationFrame(() => {
      restoreSizeGuideFocus.current = false;
      sizeGuideTrigger.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [sizeGuideOpen]);

  useEffect(() => {
    if (feedback?.kind !== "error") return;
    cartError.current?.focus({ preventScroll: true });
  }, [feedback]);

  function openSizeGuide() {
    restoreSizeGuideFocus.current = false;
    setSizeGuideOpen(true);
  }

  function closeSizeGuide() {
    restoreSizeGuideFocus.current = true;
    setSizeGuideOpen(false);
  }

  async function addToCart() {
    if (!selectedSize || cartRequestInFlight.current) return;

    cartRequestInFlight.current = true;
    setCartBusy(true);
    setFeedback(null);
    try {
      const variantId = createLaunchVariantId(product.slug, selectedSize);
      const currentCart = await ensureOpenCart();
      const currentQuantity =
        currentCart.lines.find((line) => line.variantId === variantId)
          ?.quantity ?? 0;
      if (currentQuantity >= 5) {
        throw new CartApiError("MAX_QUANTITY");
      }

      const updatedCart = await setCartLineQuantity(
        variantId,
        currentQuantity + 1,
      );
      const updatedLine = updatedCart.lines.find(
        (line) => line.variantId === variantId,
      );
      if (!updatedLine) throw new CartApiError("MALFORMED_RESPONSE");
      setFeedback({
        kind: "success",
        quantity: updatedLine.quantity,
        size: selectedSize,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        code: error instanceof CartApiError ? error.code : "CART_UNAVAILABLE",
      });
    } finally {
      cartRequestInFlight.current = false;
      setCartBusy(false);
    }
  }

  function cartFeedbackText() {
    if (feedback?.kind === "success") {
      return t("product.cartAdded")
        .replace("{size}", feedback.size)
        .replace("{count}", String(feedback.quantity));
    }
    if (feedback?.kind === "error") {
      if (feedback.code === "OUT_OF_STOCK") {
        return t("product.cartOutOfStock");
      }
      if (feedback.code === "MAX_QUANTITY") {
        return t("product.cartMaxQuantity");
      }
      return t("product.cartUnavailable");
    }
    return t("product.cartSecureNotice");
  }

  return (
    <aside
      className={styles.purchasePanel}
      aria-label={t("product.purchaseInfoLabel")}
      aria-busy={cartBusy}
    >
      <p className={styles.eyebrow}>{t("product.status")}</p>
      <h1>{product.model}</h1>
      <p className={styles.colorName}>{product.name}</p>

      <div className={styles.price}>
        <strong>{formatPrice(product.priceCents, locale)}</strong>
        <span>{t("product.priceLabel")}</span>
      </div>

      <p className={styles.description}>
        {localizedProduct.description}
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
          <button
            className={styles.sizeGuideTrigger}
            type="button"
            ref={sizeGuideTrigger}
            onClick={openSizeGuide}
            aria-expanded={sizeGuideOpen}
            aria-controls="size-guide-dialog"
          >
            {t("product.sizeGuide")}
          </button>
        </legend>
        <div className={styles.sizeOptions}>
          {sizes.map((size) => {
            const label = stockLabel(size);
            const soldOut = availability[size].state === "sold-out";

            return (
              <button
                className={styles.sizeButton}
                type="button"
                key={size}
                aria-pressed={selectedSize === size}
                aria-label={`${t("product.size")} ${size}, ${label}`}
                disabled={soldOut}
                onClick={() => selectSize(size)}
              >
                <span>{size}</span>
                <span className={styles.sizeAvailability}>{label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {sizeGuideOpen && (
        <div
          className={styles.sizeGuideOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSizeGuide();
          }}
        >
          <div
            className={styles.sizeGuideDialog}
            id="size-guide-dialog"
            ref={sizeGuideDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="size-guide-title"
          >
            <div className={styles.sizeGuideHeader}>
              <div>
                <p className={styles.eyebrow}>{product.model}</p>
                <h2 id="size-guide-title">{t("product.sizeGuide")}</h2>
              </div>
              <button
                className={styles.sizeGuideClose}
                type="button"
                ref={sizeGuideClose}
                onClick={closeSizeGuide}
                aria-label={t("product.close")}
              >
                ×
              </button>
            </div>
            <p className={styles.sizeGuideIntro}>{t("product.sizeGuideIntro")}</p>
            <div className={styles.sizeGuideTableWrap}>
              <table className={styles.sizeGuideTable}>
                <thead>
                  <tr>
                    <th scope="col">{t("product.size")}</th>
                    <th scope="col">{t("product.waistMeasurement")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sizes.map((size) => (
                    <tr key={size}>
                      <th scope="row">{size}</th>
                      <td>{t("product.sizeGuidePending")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.sizeGuideNote}>{t("product.sizeGuideNote")}</p>
          </div>
        </div>
      )}

      <button
        className={styles.purchaseButton}
        type="button"
        disabled={!selectedSize || cartBusy}
        onClick={() => void addToCart()}
        aria-busy={cartBusy}
      >
        {cartBusy
          ? t("product.adding")
          : selectedSize
            ? t("product.addDemo")
            : t("product.selectSizePrompt")}
      </button>

      <p
        className={
          feedback?.kind === "error"
            ? `${styles.notice} ${styles.purchaseError}`
            : styles.notice
        }
        ref={feedback?.kind === "error" ? cartError : undefined}
        role={feedback?.kind === "error" ? "alert" : "status"}
        aria-live={feedback?.kind === "error" ? "assertive" : "polite"}
        tabIndex={feedback?.kind === "error" ? -1 : undefined}
      >
        {cartFeedbackText()}
      </p>

      {feedback?.kind === "success" && (
        <Link
          className={styles.cartLink}
          href="/cart"
        >
          {t("product.viewCart")}
        </Link>
      )}

      <div className={styles.details}>
        <details>
          <summary>{t("product.fullDescription")}</summary>
          <div className={styles.detailsContent}>
            {localizedProduct.details.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </details>

        <details>
          <summary>{t("product.features")}</summary>
          <div className={styles.detailsContent}>
            <ul className={styles.featureList}>
              {localizedProduct.features.map((feature) => (
                <li key={feature}>{feature}</li>
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
