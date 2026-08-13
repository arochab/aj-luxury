"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { getCart, type PublicCartSnapshot } from "../../lib/commerce/preprod-cart-client";
import {
  requestShippingQuote,
  shippingQuoteAttemptCanReplay,
  ShippingQuoteApiError,
  type PublicShippingQuote,
  type ShippingAddress,
} from "../../lib/commerce/preprod-shipping-client";
import { useI18n } from "../../lib/i18n/I18nProvider";
import LocalizedPrice from "../components/LocalizedPrice";
import styles from "../cart/CommerceShell.module.css";

const launchCountryCodes = Object.freeze([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
  "FR", "GR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL",
  "PT", "RO", "SE", "SI", "SK", "GB", "US", "CA",
] as const);

type AddressState = {
  recipient: string;
  company: string;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  regionCode: string;
  countryCode: string;
};

const initialAddress: AddressState = {
  recipient: "",
  company: "",
  line1: "",
  line2: "",
  postalCode: "",
  city: "",
  regionCode: "",
  countryCode: "FR",
};

function shippingAddress(state: AddressState): ShippingAddress {
  return Object.freeze({
    recipient: state.recipient,
    ...(state.company ? { company: state.company } : {}),
    line1: state.line1,
    ...(state.line2 ? { line2: state.line2 } : {}),
    postalCode: state.postalCode,
    city: state.city,
    ...(state.regionCode ? { regionCode: state.regionCode } : {}),
    countryCode: state.countryCode,
  });
}

export default function CheckoutClient() {
  const { locale, t } = useI18n();
  const [cart, setCart] = useState<PublicCartSnapshot | null>(null);
  const [address, setAddress] = useState<AddressState>(initialAddress);
  const [quote, setQuote] = useState<PublicShippingQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const attemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const loadCart = useCallback(async () => {
    // An explicit cart refresh starts a new semantic attempt. Network retries
    // without a refresh keep their key in submit(), preserving idempotency.
    attemptRef.current = null;
    setQuote(null);
    setLoading(true);
    setErrorCode(null);
    try {
      setCart(await getCart());
    } catch {
      setCart(null);
      setErrorCode("CART_UNAVAILABLE");
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
      .catch(() => {
        if (!active) return;
        setCart(null);
        setErrorCode("CART_UNAVAILABLE");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (errorCode) errorRef.current?.focus({ preventScroll: true });
  }, [errorCode]);

  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return launchCountryCodes
      .map((code) => ({ code, label: names.of(code) ?? code }))
      .sort((left, right) => left.label.localeCompare(right.label, locale));
  }, [locale]);

  function updateAddress(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.currentTarget;
    setAddress((current) => ({
      ...current,
      [name]: value,
      ...(name === "countryCode" && value !== "US" ? { regionCode: "" } : {}),
    }));
    setQuote(null);
    setErrorCode(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !cart || cart.lines.length === 0) return;
    const candidate = shippingAddress(address);
    const fingerprint = JSON.stringify(candidate);
    const previous = attemptRef.current;
    const key = previous?.fingerprint === fingerprint
      ? previous.key
      : crypto.randomUUID();
    attemptRef.current = { fingerprint, key };
    setSubmitting(true);
    setErrorCode(null);
    setQuote(null);
    try {
      const nextQuote = await requestShippingQuote(candidate, key);
      setQuote(nextQuote);
    } catch (error) {
      const code = error instanceof ShippingQuoteApiError
        ? error.code
        : "SHIPPING_QUOTE_UNAVAILABLE";
      if (!shippingQuoteAttemptCanReplay(code)) attemptRef.current = null;
      setErrorCode(code);
    } finally {
      setSubmitting(false);
    }
  }

  const errorMessage = errorCode === "CONFIGURATION_UNAVAILABLE"
    ? t("checkout.configurationUnavailable")
    : errorCode === "DESTINATION_UNAVAILABLE"
      ? t("checkout.destinationUnavailable")
      : errorCode === "INVALID_ADDRESS" || errorCode === "INVALID_JSON"
        ? t("checkout.invalidAddress")
        : errorCode === "OUT_OF_STOCK"
          ? t("checkout.outOfStock")
          : errorCode === "CART_CHANGED" || errorCode === "CART_EXPIRED"
            ? t("checkout.cartChanged")
            : t("checkout.unavailable");
  const subtotal = cart?.subtotalCents ?? 0;
  const total = subtotal + (quote?.amountCents ?? 0);

  if (!loading && cart && cart.lines.length === 0) {
    return (
      <div className={styles.main}>
        <section className={styles.empty} aria-labelledby="checkout-empty-title">
          <h1 id="checkout-empty-title">{t("checkout.emptyTitle")}</h1>
          <p>{t("checkout.emptyBody")}</p>
          <Link className={styles.button} href="/shop">
            {t("cart.continueShopping")}
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.main} aria-busy={loading || submitting}>
      <section aria-labelledby="checkout-title">
        <p className={styles.eyebrow}>{t("checkout.step")}</p>
        <h1 className={styles.title} id="checkout-title">
          {t("checkout.shippingTitle")}
        </h1>
        <div className={styles.cartStatus} aria-live="polite">
          {loading ? t("checkout.loadingCart") : null}
        </div>

        {errorCode && (
          <div className={styles.error} ref={errorRef} role="alert" tabIndex={-1}>
            <p>{errorMessage}</p>
            {(errorCode === "CART_CHANGED" ||
              errorCode === "CART_EXPIRED" ||
              errorCode === "CART_UNAVAILABLE") && (
              <button type="button" onClick={() => void loadCart()}>
                {t("cart.retry")}
              </button>
            )}
          </div>
        )}

        {!loading && cart && cart.lines.length > 0 && (
          <form className={styles.form} onSubmit={(event) => void submit(event)}>
            <label>
              {t("checkout.recipient")}
              <input
                name="recipient"
                autoComplete="name"
                value={address.recipient}
                onChange={updateAddress}
                required
                maxLength={120}
              />
            </label>
            <label>
              {t("checkout.companyOptional")}
              <input
                name="company"
                autoComplete="organization"
                value={address.company}
                onChange={updateAddress}
                maxLength={120}
              />
            </label>
            <label>
              {t("checkout.address")}
              <input
                name="line1"
                autoComplete="address-line1"
                value={address.line1}
                onChange={updateAddress}
                required
                maxLength={160}
              />
            </label>
            <label>
              {t("checkout.addressLine2Optional")}
              <input
                name="line2"
                autoComplete="address-line2"
                value={address.line2}
                onChange={updateAddress}
                maxLength={160}
              />
            </label>
            <div className={styles.formGrid}>
              <label>
                {t("checkout.postalCode")}
                <input
                  name="postalCode"
                  autoComplete="postal-code"
                  value={address.postalCode}
                  onChange={updateAddress}
                  required
                  maxLength={16}
                />
              </label>
              <label>
                {t("checkout.city")}
                <input
                  name="city"
                  autoComplete="address-level2"
                  value={address.city}
                  onChange={updateAddress}
                  required
                  maxLength={120}
                />
              </label>
            </div>
            <div className={styles.formGrid}>
              <label>
                {t("checkout.country")}
                <select
                  name="countryCode"
                  autoComplete="country"
                  value={address.countryCode}
                  onChange={updateAddress}
                  required
                >
                  {countries.map(({ code, label }) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </label>
              {address.countryCode === "US" && (
                <label>
                  {t("checkout.usState")}
                  <input
                    name="regionCode"
                    autoComplete="address-level1"
                    value={address.regionCode}
                    onChange={updateAddress}
                    required
                    minLength={2}
                    maxLength={2}
                    placeholder="NY"
                  />
                </label>
              )}
            </div>
            <button className={styles.button} type="submit" disabled={submitting}>
              {submitting
                ? t("checkout.calculatingShipping")
                : t("checkout.calculateShipping")}
            </button>
          </form>
        )}
      </section>

      {cart && cart.lines.length > 0 && (
        <aside className={styles.summary} aria-label={t("checkout.selection")}>
          <p className={styles.eyebrow}>{t("checkout.selection")}</p>
          {cart.lines.map((line) => (
            <div className={styles.row} key={line.variantId}>
              <span>
                {line.colorName}<br />
                Apollon · {t("product.size")} {line.size} × {line.quantity}
              </span>
              <span><LocalizedPrice amountCents={line.lineTotalCents} /></span>
            </div>
          ))}
          <div className={styles.row}>
            <span>{t("cart.subtotal")}</span>
            <span><LocalizedPrice amountCents={subtotal} /></span>
          </div>
          <div className={styles.row}>
            <span>{t("cart.shipping")}</span>
            <span>
              {quote
                ? <LocalizedPrice amountCents={quote.amountCents} />
                : t("cart.toDefine")}
            </span>
          </div>
          <div className={`${styles.row} ${styles.total}`}>
            <span>{t("checkout.provisionalTotal")}</span>
            <span><LocalizedPrice amountCents={total} /></span>
          </div>
          {quote && (
            <div className={styles.quote} aria-live="polite">
              <strong>{t("checkout.simulationResult")}</strong>
              <p>
                {t("checkout.estimatedDelivery")} {quote.estimatedDaysMin}–{quote.estimatedDaysMax} {t("checkout.days")}
              </p>
              <p>
                {quote.dutiesTerms === "EU_INCLUDED"
                  ? t("checkout.euDuties")
                  : t("checkout.dapDuties")}
              </p>
            </div>
          )}
          <p className={styles.muted}>{t("checkout.taxesPending")}</p>
          <button className={styles.lockedButton} type="button" disabled>
            {t("checkout.paymentClosed")}
          </button>
          <p className={styles.muted}>{t("checkout.securityNote")}</p>
        </aside>
      )}
    </div>
  );
}
