"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
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
import {
  createPreprodOrder,
  getCurrentPreprodOrder,
  payPreprodOrder,
  PreprodOrderApiError,
  type PublicPreprodOrder,
} from "../../lib/commerce/preprod-order-client";
import { useI18n } from "../../lib/i18n/I18nProvider";
import LocalizedPrice from "../components/LocalizedPrice";
import {
  SYNTHETIC_DEMO_ADDRESS_FIXTURES,
  SYNTHETIC_DEMO_EMAIL,
  type SyntheticDemoZone,
} from "../../lib/preprod/synthetic-demo";
import styles from "../cart/CommerceShell.module.css";

const fixtureLabelKey = {
  EU: "checkout.fixtureEU",
  UK: "checkout.fixtureUK",
  US: "checkout.fixtureUS",
  CA: "checkout.fixtureCA",
} as const satisfies Record<SyntheticDemoZone, string>;

export default function CheckoutClient() {
  const { t } = useI18n();
  const [cart, setCart] = useState<PublicCartSnapshot | null>(null);
  const [fixtureZone, setFixtureZone] = useState<SyntheticDemoZone>("EU");
  const [quote, setQuote] = useState<PublicShippingQuote | null>(null);
  const [order, setOrder] = useState<PublicPreprodOrder | null>(null);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [simulationAccepted, setSimulationAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef<HTMLDivElement>(null);
  const attemptRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const orderAttemptRef = useRef<string | null>(null);
  const paymentAttemptRef = useRef<string | null>(null);
  const selectedFixture = SYNTHETIC_DEMO_ADDRESS_FIXTURES.find(
    (fixture) => fixture.zone === fixtureZone,
  ) ?? SYNTHETIC_DEMO_ADDRESS_FIXTURES[0];
  const address: ShippingAddress = selectedFixture.address;
  const syntheticQualifier = t("checkout.syntheticQualifier");

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
    void getCurrentPreprodOrder()
      .then(async (currentOrder) => {
        if (!active) return;
        setOrder(currentOrder);
        if (currentOrder) return;
        const snapshot = await getCart();
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

  useEffect(() => {
    if (order) orderRef.current?.focus({ preventScroll: true });
  }, [order]);

  function chooseFixture(value: string) {
    if (!(["EU", "UK", "US", "CA"] as const).includes(value as SyntheticDemoZone)) return;
    setFixtureZone(value as SyntheticDemoZone);
    setQuote(null);
    setOrder(null);
    orderAttemptRef.current = null;
    paymentAttemptRef.current = null;
    setErrorCode(null);
  }

  async function createOrder() {
    if (!quote || !legalAccepted || !simulationAccepted || submitting) return;
    setSubmitting(true);
    setErrorCode(null);
    try {
      const idempotencyKey = orderAttemptRef.current ?? crypto.randomUUID();
      orderAttemptRef.current = idempotencyKey;
      setOrder(await createPreprodOrder({
        quoteId: quote.quoteId,
        address,
        email: SYNTHETIC_DEMO_EMAIL,
        idempotencyKey,
      }));
    } catch (error) {
      setErrorCode(error instanceof PreprodOrderApiError ? error.code : "CHECKOUT_UNAVAILABLE");
    } finally {
      setSubmitting(false);
    }
  }

  async function payOrder() {
    if (!order || order.status === "paid" || submitting) return;
    setSubmitting(true);
    setErrorCode(null);
    try {
      const idempotencyKey = paymentAttemptRef.current ?? crypto.randomUUID();
      paymentAttemptRef.current = idempotencyKey;
      setOrder(await payPreprodOrder(idempotencyKey));
    } catch (error) {
      setErrorCode(error instanceof PreprodOrderApiError ? error.code : "CHECKOUT_UNAVAILABLE");
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !cart || cart.lines.length === 0) return;
    const candidate = address;
    const fingerprint = JSON.stringify(candidate);
    const previous = attemptRef.current;
    const key = previous?.fingerprint === fingerprint
      ? previous.key
      : crypto.randomUUID();
    attemptRef.current = { fingerprint, key };
    setSubmitting(true);
    setErrorCode(null);
    setQuote(null);
    setOrder(null);
    orderAttemptRef.current = null;
    paymentAttemptRef.current = null;
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
    : errorCode === "PARCEL_CONFIGURATION_UNAVAILABLE"
      ? t("checkout.parcelUnavailable")
    : errorCode === "DESTINATION_UNAVAILABLE"
      ? t("checkout.destinationUnavailable")
      : errorCode === "INVALID_ADDRESS" || errorCode === "INVALID_JSON"
        ? t("checkout.invalidAddress")
        : errorCode === "OUT_OF_STOCK"
          ? t("checkout.outOfStock")
          : errorCode === "CART_CHANGED" || errorCode === "CART_EXPIRED"
            ? t("checkout.cartChanged")
            : t("checkout.unavailable");
  const subtotal = order?.subtotalCents ?? cart?.subtotalCents ?? 0;
  const shipping = order?.shippingCents ?? quote?.amountCents ?? 0;
  const total = order?.totalCents ?? subtotal + shipping;

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

        {!loading && !order && cart && cart.lines.length > 0 && (
          <form className={styles.form} onSubmit={(event) => void submit(event)}>
            <label>
              {t("checkout.country")} ({syntheticQualifier})
              <select
                value={fixtureZone}
                disabled={submitting}
                onChange={(event) => chooseFixture(event.currentTarget.value)}
              >
                {SYNTHETIC_DEMO_ADDRESS_FIXTURES.map((fixture) => (
                  <option key={fixture.zone} value={fixture.zone}>
                    {t(fixtureLabelKey[fixture.zone])}
                  </option>
                ))}
              </select>
            </label>
            <address className={styles.addressFixture}>
              <strong>{address.recipient}</strong><br />
              {address.line1}<br />
              {address.postalCode} {address.city}<br />
              {address.regionCode ? `${address.regionCode} · ` : ""}{address.countryCode}
            </address>
            <button className={styles.button} type="submit" disabled={submitting}>
              {submitting
                ? t("checkout.calculatingShipping")
                : t("checkout.calculateShipping")}
            </button>
          </form>
        )}
      </section>

      {((order && order.lines.length > 0) || (cart && cart.lines.length > 0)) && (
        <aside className={styles.summary} aria-label={t("checkout.selection")}>
          <p className={styles.eyebrow}>{t("checkout.selection")}</p>
          {(order?.lines ?? cart?.lines ?? []).map((line, index) => (
            <div className={styles.row} key={"variantId" in line ? line.variantId : `${line.colorName}-${line.size}-${index}`}>
              <span>
                {line.colorName}<br />
                Apollon · {t("product.size")} {line.size} × {line.quantity}
              </span>
              <span><LocalizedPrice amountCents={line.lineTotalCents} /> <small>({syntheticQualifier})</small></span>
            </div>
          ))}
          <div className={styles.row}>
            <span>{t("cart.subtotal")}</span>
            <span><LocalizedPrice amountCents={subtotal} /> <small>({syntheticQualifier})</small></span>
          </div>
          <div className={styles.row}>
            <span>{t("cart.shipping")}</span>
            <span>
              {quote
                ? <><LocalizedPrice amountCents={shipping} /> <small>({syntheticQualifier})</small></>
                : order
                  ? <><LocalizedPrice amountCents={shipping} /> <small>({syntheticQualifier})</small></>
                : t("cart.toDefine")}
            </span>
          </div>
          <div className={`${styles.row} ${styles.total}`}>
            <span>{t("checkout.provisionalTotal")}</span>
            <span><LocalizedPrice amountCents={total} /> <small>({syntheticQualifier})</small></span>
          </div>
          {quote && (
            <div className={styles.quote} aria-live="polite">
              <strong>{t("checkout.simulationResult")}</strong>
              <p>
                {t("checkout.estimatedDelivery")} {quote.estimatedDaysMin}–{quote.estimatedDaysMax} {t("checkout.days")} ({syntheticQualifier})
              </p>
              <p>
                {t("checkout.parcelProfile")} {quote.parcel.weightGrams} g · {quote.parcel.lengthCm} × {quote.parcel.widthCm} × {quote.parcel.heightCm} cm
              </p>
              <p>
                {quote.dutiesTerms === "EU_INCLUDED"
                  ? t("checkout.euDuties")
                  : t("checkout.dapDuties")}
              </p>
            </div>
          )}
          {quote && !order && (
            <div className={styles.testCheckout}>
              <label>
                {t("checkout.demoEmail")}
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={SYNTHETIC_DEMO_EMAIL}
                  readOnly
                  required
                />
              </label>
              <label className={styles.checkbox}>
                <input type="checkbox" checked={legalAccepted} onChange={(event) => setLegalAccepted(event.currentTarget.checked)} />
                <span>
                  {t("checkout.legalAck")} <Link href="/terms">{t("footer.terms")}</Link>{" "}
                  <Link href="/privacy">{t("footer.privacy")}</Link>
                </span>
              </label>
              <label className={styles.checkbox}>
                <input type="checkbox" checked={simulationAccepted} onChange={(event) => setSimulationAccepted(event.currentTarget.checked)} />
                <span>{t("checkout.simulationAck")}</span>
              </label>
              <button className={styles.button} type="button" disabled={submitting || !legalAccepted || !simulationAccepted} onClick={() => void createOrder()}>
                {t("checkout.createTestOrder")}
              </button>
            </div>
          )}
          {order && (
            <div
              className={styles.quote}
              aria-live="polite"
              role="status"
              tabIndex={-1}
              ref={orderRef}
            >
              <strong>{order.status === "paid" ? t("checkout.testPaid") : t("checkout.testOrderCreated")}</strong>
              <p>{order.orderNumber}</p>
              <p>{t("checkout.noDebitNoEmail")}</p>
              {order.status === "pending_payment" && (
                <button className={styles.button} type="button" disabled={submitting} onClick={() => void payOrder()}>
                  {t("checkout.simulatePayment")}
                </button>
              )}
            </div>
          )}
          <p className={styles.muted}>{t("checkout.taxesPending")}</p>
          <p className={styles.muted}>{t("checkout.securityNote")}</p>
        </aside>
      )}
    </div>
  );
}
