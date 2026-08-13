"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import LocalizedPrice from "../components/LocalizedPrice";
import { useI18n } from "../../lib/i18n/I18nProvider";
import {
  CartApiError,
  getCart,
  removeCartLine,
  setCartLineQuantity,
  type PublicCartSnapshot,
} from "../../lib/commerce/preprod-cart-client";
import styles from "./CommerceShell.module.css";

function interpolate(
  value: string,
  variables: Record<string, string | number>,
): string {
  return Object.entries(variables).reduce(
    (text, [key, replacement]) =>
      text.replaceAll(`{${key}}`, String(replacement)),
    value,
  );
}

export default function CartClient() {
  const { t } = useI18n();
  const [cart, setCart] = useState<PublicCartSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyVariant, setBusyVariant] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const mutationInFlight = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorCode(null);
    try {
      setCart(await getCart());
    } catch (error) {
      setCart(null);
      setErrorCode(
        error instanceof CartApiError ? error.code : "CART_UNAVAILABLE",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void getCart()
      .then((snapshot) => {
        if (!active) return;
        setCart(snapshot);
        setErrorCode(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCart(null);
        setErrorCode(
          error instanceof CartApiError ? error.code : "CART_UNAVAILABLE",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!errorCode) return;
    errorRef.current?.focus({ preventScroll: true });
  }, [errorCode]);

  async function updateQuantity(variantId: string, quantity: number) {
    if (mutationInFlight.current || quantity < 1 || quantity > 5) return;
    mutationInFlight.current = true;
    setBusyVariant(variantId);
    setErrorCode(null);
    try {
      setCart(await setCartLineQuantity(variantId, quantity));
    } catch (error) {
      setErrorCode(
        error instanceof CartApiError ? error.code : "CART_UNAVAILABLE",
      );
    } finally {
      mutationInFlight.current = false;
      setBusyVariant(null);
    }
  }

  async function remove(variantId: string) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusyVariant(variantId);
    setErrorCode(null);
    try {
      setCart(await removeCartLine(variantId));
    } catch (error) {
      setErrorCode(
        error instanceof CartApiError ? error.code : "CART_UNAVAILABLE",
      );
    } finally {
      mutationInFlight.current = false;
      setBusyVariant(null);
    }
  }

  const errorMessage =
    errorCode === "OUT_OF_STOCK"
      ? t("cart.outOfStockError")
      : t("cart.unavailableError");
  const itemCount = cart?.itemCount ?? 0;
  const cartMutating = busyVariant !== null;

  return (
    <div
      className={styles.main}
      aria-busy={loading || busyVariant !== null}
    >
      <section aria-labelledby="cart-title">
        <p className={styles.eyebrow}>
          {interpolate(t("cart.itemCount"), { count: itemCount })}
        </p>
        <h1 className={styles.title} id="cart-title">
          {t("cart.selectionTitle")}
        </h1>

        <div className={styles.cartStatus} aria-live="polite">
          {loading ? t("cart.loading") : null}
        </div>

        {errorCode && (
          <div
            className={styles.error}
            ref={errorRef}
            role="alert"
            tabIndex={-1}
          >
            <p>{errorMessage}</p>
            <button type="button" onClick={() => void load()}>
              {t("cart.retry")}
            </button>
          </div>
        )}

        {!loading && !errorCode && cart?.lines.length === 0 && (
          <div className={styles.empty}>
            <h2>{t("cart.emptyTitle")}</h2>
            <p>{t("cart.emptyBody")}</p>
            <Link className={styles.button} href="/shop">
              {t("cart.continueShopping")}
            </Link>
          </div>
        )}

        {!loading && cart?.lines.map((line) => {
          const lineBusy = busyVariant === line.variantId;
          return (
            <article
              className={styles.line}
              key={line.variantId}
              aria-busy={lineBusy}
            >
              <Link
                className={styles.lineImage}
                href={`/products/${line.productSlug}`}
                aria-label={`${line.colorName}, ${t("product.size")} ${line.size}`}
              >
                <Image
                  src={line.imageUrl}
                  alt={`${line.colorName}, ${t("product.size")} ${line.size}`}
                  fill
                  unoptimized
                  sizes="(max-width: 800px) 100px, 140px"
                />
              </Link>
              <div className={styles.lineDetails}>
                <h2>{line.colorName}</h2>
                <p>
                  Apollon · {t("product.size")} {line.size}
                  <br />
                  {line.stockState === "sold-out"
                    ? t("product.soldOut")
                    : line.stockState === "low-stock"
                      ? t("cart.lowStock")
                      : t("cart.stockSimulated")}
                </p>
                <div
                  className={styles.quantityControl}
                  role="group"
                  aria-label={t("cart.quantity")}
                >
                  <button
                    type="button"
                    disabled={cartMutating || line.quantity <= 1}
                    onClick={() =>
                      void updateQuantity(line.variantId, line.quantity - 1)
                    }
                    aria-label={t("cart.decreaseQuantity")}
                  >
                    −
                  </button>
                  <output aria-live="polite" aria-label={t("cart.quantity")}>
                    {line.quantity}
                  </output>
                  <button
                    type="button"
                    disabled={
                      cartMutating ||
                      line.quantity >= 5 ||
                      line.stockState === "sold-out"
                    }
                    onClick={() =>
                      void updateQuantity(line.variantId, line.quantity + 1)
                    }
                    aria-label={t("cart.increaseQuantity")}
                  >
                    +
                  </button>
                  <button
                    className={styles.removeButton}
                    type="button"
                    disabled={cartMutating}
                    onClick={() => void remove(line.variantId)}
                  >
                    {lineBusy ? t("cart.updating") : t("cart.remove")}
                  </button>
                </div>
              </div>
              <strong>
                <LocalizedPrice amountCents={line.lineTotalCents} />{" "}
                <small>({t("cart.syntheticQualifier")})</small>
              </strong>
            </article>
          );
        })}
      </section>

      {!loading && !errorCode && cart && cart.lines.length > 0 && (
        <aside className={styles.summary} aria-label={t("cart.summary")}>
          <p className={styles.eyebrow}>{t("cart.summary")}</p>
          <h2>{t("cart.estimatedTotal")}</h2>
          <div className={styles.row}>
            <span>{t("cart.subtotal")}</span>
            <span>
              <LocalizedPrice amountCents={cart.subtotalCents} />{" "}
              <small>({t("cart.syntheticQualifier")})</small>
            </span>
          </div>
          <div className={`${styles.row} ${styles.total}`}>
            <span>{t("cart.provisionalTotal")}</span>
            <span>
              <LocalizedPrice amountCents={cart.subtotalCents} />{" "}
              <small>({t("cart.syntheticQualifier")})</small>
            </span>
          </div>
          <Link className={styles.button} href="/checkout">
            {t("cart.continueToCheckout")}
          </Link>
          <Link className={styles.secondary} href="/shop">
            {t("cart.continueShopping")}
          </Link>
          <p className={styles.muted}>{t("cart.conditionsPending")}</p>
        </aside>
      )}
    </div>
  );
}
