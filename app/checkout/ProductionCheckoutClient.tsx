"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  getCart,
  type PublicCartSnapshot,
} from "../../lib/commerce/preprod-cart-client";
import {
  type ShippingAddress,
} from "../../lib/commerce/preprod-shipping-client";
import {
  requestProductionDeliveryOptions,
  requestProductionServicePoints,
  selectProductionDeliveryOption,
  ProductionDeliveryApiError,
  type PublicProductionDeliveryOption,
  type PublicProductionServicePoint,
} from "../../lib/commerce/production-delivery-client";
import {
  createProductionOrder,
  createProductionPaymentSession,
  getCurrentProductionOrder,
  ProductionOrderApiError,
  type PublicProductionOrder,
} from "../../lib/commerce/production-order-client";
import { useI18n } from "../../lib/i18n/I18nProvider";
import LocalizedPrice from "../components/LocalizedPrice";
import styles from "../cart/CommerceShell.module.css";

const launchCountries = Object.freeze([
  ["AT", "Autriche"], ["BE", "Belgique"], ["BG", "Bulgarie"],
  ["HR", "Croatie"], ["CY", "Chypre"], ["CZ", "Tchéquie"],
  ["DK", "Danemark"], ["EE", "Estonie"], ["FI", "Finlande"],
  ["FR", "France"], ["DE", "Allemagne"], ["GR", "Grèce"],
  ["HU", "Hongrie"], ["IE", "Irlande"], ["IT", "Italie"],
  ["LV", "Lettonie"], ["LT", "Lituanie"], ["LU", "Luxembourg"],
  ["MT", "Malte"], ["NL", "Pays-Bas"], ["PL", "Pologne"],
  ["PT", "Portugal"], ["RO", "Roumanie"], ["SK", "Slovaquie"],
  ["SI", "Slovénie"], ["ES", "Espagne"], ["SE", "Suède"],
] as const);

type AddressForm = {
  recipient: string;
  company: string;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  regionCode: string;
  countryCode: string;
};

const initialAddress: AddressForm = {
  recipient: "",
  company: "",
  line1: "",
  line2: "",
  postalCode: "",
  city: "",
  regionCode: "",
  countryCode: "FR",
};

function shippingAddress(value: AddressForm): ShippingAddress {
  return Object.freeze({
    recipient: value.recipient.trim(),
    ...(value.company.trim() ? { company: value.company.trim() } : {}),
    line1: value.line1.trim(),
    ...(value.line2.trim() ? { line2: value.line2.trim() } : {}),
    postalCode: value.postalCode.trim(),
    city: value.city.trim(),
    ...(value.regionCode.trim()
      ? { regionCode: value.regionCode.trim().toUpperCase() }
      : {}),
    countryCode: value.countryCode,
  });
}

export default function ProductionCheckoutClient() {
  const { t } = useI18n();
  const [cart, setCart] = useState<PublicCartSnapshot | null>(null);
  const [form, setForm] = useState<AddressForm>(initialAddress);
  const [email, setEmail] = useState("");
  const [options, setOptions] = useState<readonly PublicProductionDeliveryOption[] | null>(null);
  const [selected, setSelected] = useState<PublicProductionDeliveryOption | null>(null);
  const [relayOption, setRelayOption] = useState<PublicProductionDeliveryOption | null>(null);
  const [points, setPoints] = useState<readonly PublicProductionServicePoint[] | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<PublicProductionServicePoint | null>(null);
  const [order, setOrder] = useState<PublicProductionOrder | null>(null);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const quoteAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const selectAttempt = useRef<{ optionId: string; key: string } | null>(null);
  const pointsAttempt = useRef<{ optionId: string; key: string } | null>(null);
  const orderAttempt = useRef<string | null>(null);
  const paymentAttempt = useRef<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorCode(null);
    try {
      const currentOrder = await getCurrentProductionOrder();
      setOrder(currentOrder);
      if (!currentOrder) setCart(await getCart("production"));
    } catch {
      setErrorCode("CHECKOUT_UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  useEffect(() => {
    if (errorCode) errorRef.current?.focus({ preventScroll: true });
  }, [errorCode]);

  function updateField(field: keyof AddressForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setOptions(null);
    setSelected(null);
    setRelayOption(null);
    setPoints(null);
    setSelectedPoint(null);
    quoteAttempt.current = null;
    selectAttempt.current = null;
    pointsAttempt.current = null;
  }

  async function requestOptions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !cart?.lines.length) return;
    const address = shippingAddress(form);
    const fingerprint = JSON.stringify(address);
    const key = quoteAttempt.current?.fingerprint === fingerprint
      ? quoteAttempt.current.key
      : crypto.randomUUID();
    quoteAttempt.current = { fingerprint, key };
    setSubmitting(true);
    setErrorCode(null);
    setSelected(null);
    setRelayOption(null);
    setPoints(null);
    setSelectedPoint(null);
    try {
      setOptions(await requestProductionDeliveryOptions(address, key));
    } catch (error) {
      const code = error instanceof ProductionDeliveryApiError
        ? error.code
        : "DELIVERY_UNAVAILABLE";
      if (["CART_UNAVAILABLE", "INVALID_INPUT"].includes(code)) {
        quoteAttempt.current = null;
      }
      setErrorCode(code);
    } finally {
      setSubmitting(false);
    }
  }

  async function choose(option: PublicProductionDeliveryOption) {
    if (submitting) return;
    if (option.deliveryMode === "service_point") {
      const key = pointsAttempt.current?.optionId === option.optionId
        ? pointsAttempt.current.key
        : crypto.randomUUID();
      pointsAttempt.current = { optionId: option.optionId, key };
      setSubmitting(true);
      setErrorCode(null);
      setSelected(null);
      setSelectedPoint(null);
      try {
        const available = await requestProductionServicePoints(
          option.optionId,
          shippingAddress(form),
          key,
        );
        setRelayOption(option);
        setPoints(available);
        if (available.length === 0) setErrorCode("SERVICE_POINT_UNAVAILABLE");
      } catch (error) {
        setErrorCode(error instanceof ProductionDeliveryApiError
          ? error.code
          : "DELIVERY_UNAVAILABLE");
      } finally {
        setSubmitting(false);
      }
      return;
    }
    const key = selectAttempt.current?.optionId === option.optionId
      ? selectAttempt.current.key
      : crypto.randomUUID();
    selectAttempt.current = { optionId: option.optionId, key };
    setSubmitting(true);
    setErrorCode(null);
    try {
      setSelected(await selectProductionDeliveryOption(
        option.optionId,
        shippingAddress(form),
        key,
      ));
      setRelayOption(null);
      setPoints(null);
    } catch (error) {
      setErrorCode(error instanceof ProductionDeliveryApiError
        ? error.code
        : "DELIVERY_UNAVAILABLE");
    } finally {
      setSubmitting(false);
    }
  }

  async function choosePoint(point: PublicProductionServicePoint) {
    if (!relayOption || submitting || point.optionId !== relayOption.optionId) return;
    const attemptId = `${relayOption.optionId}:${point.servicePointId}`;
    const key = selectAttempt.current?.optionId === attemptId
      ? selectAttempt.current.key
      : crypto.randomUUID();
    selectAttempt.current = { optionId: attemptId, key };
    setSubmitting(true);
    setErrorCode(null);
    try {
      setSelected(await selectProductionDeliveryOption(
        relayOption.optionId,
        shippingAddress(form),
        key,
        point.servicePointId,
      ));
      setSelectedPoint(point);
      setPoints(null);
    } catch (error) {
      setErrorCode(error instanceof ProductionDeliveryApiError
        ? error.code
        : "DELIVERY_UNAVAILABLE");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmOrder() {
    if (!selected || !legalAccepted || !email || submitting) return;
    setSubmitting(true);
    setErrorCode(null);
    try {
      const key = orderAttempt.current ?? crypto.randomUUID();
      orderAttempt.current = key;
      setOrder(await createProductionOrder({
        quoteId: selected.quoteId,
        optionId: selected.optionId,
        address: shippingAddress(form),
        email,
        idempotencyKey: key,
        ...(selectedPoint ? { servicePointId: selectedPoint.servicePointId } : {}),
      }));
    } catch (error) {
      setErrorCode(error instanceof ProductionOrderApiError
        ? error.code
        : "CHECKOUT_UNAVAILABLE");
    } finally {
      setSubmitting(false);
    }
  }

  async function pay() {
    if (!order || submitting) return;
    setSubmitting(true);
    setErrorCode(null);
    try {
      const key = paymentAttempt.current ?? crypto.randomUUID();
      paymentAttempt.current = key;
      const url = await createProductionPaymentSession(key);
      window.location.assign(url);
    } catch (error) {
      setErrorCode(error instanceof ProductionOrderApiError
        ? error.code
        : "CHECKOUT_UNAVAILABLE");
      setSubmitting(false);
    }
  }

  const subtotal = order?.subtotalCents ?? cart?.subtotalCents ?? 0;
  const shipping = order?.shippingCents ?? selected?.amountCents ?? 0;
  const total = order?.totalCents ?? subtotal + shipping;
  const errorMessage = errorCode === "DESTINATION_UNAVAILABLE"
    ? t("checkout.destinationUnavailable")
    : errorCode === "INVALID_ADDRESS"
      ? t("checkout.invalidAddress")
      : errorCode === "OUT_OF_STOCK"
        ? t("checkout.outOfStock")
        : errorCode === "CART_CHANGED" || errorCode === "CART_EXPIRED"
          ? t("checkout.cartChanged")
          : t("checkout.unavailable");

  if (!loading && cart && cart.lines.length === 0) {
    return (
      <div className={styles.main}>
        <section className={styles.empty}>
          <h1>{t("checkout.emptyTitle")}</h1>
          <p>{t("checkout.emptyBody")}</p>
          <Link className={styles.button} href="/shop">{t("cart.continueShopping")}</Link>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.main} aria-busy={loading || submitting}>
      <section aria-labelledby="checkout-title">
        <p className={styles.eyebrow}>{t("checkout.step")}</p>
        <h1 className={styles.title} id="checkout-title">{t("checkout.shippingTitle")}</h1>
        {loading && <p className={styles.muted}>{t("checkout.loadingCart")}</p>}
        {errorCode && (
          <div className={styles.error} ref={errorRef} role="alert" tabIndex={-1}>
            <p>{errorMessage}</p>
            <button type="button" onClick={() => void load()}>{t("cart.retry")}</button>
          </div>
        )}
        {!loading && !order && cart?.lines.length ? (
          <form className={styles.form} onSubmit={(event) => void requestOptions(event)}>
            <label>{t("checkout.recipient")}<input required autoComplete="name" value={form.recipient} onChange={(e) => updateField("recipient", e.currentTarget.value)} /></label>
            <label>{t("checkout.companyOptional")}<input autoComplete="organization" value={form.company} onChange={(e) => updateField("company", e.currentTarget.value)} /></label>
            <label>{t("checkout.address")}<input required autoComplete="address-line1" value={form.line1} onChange={(e) => updateField("line1", e.currentTarget.value)} /></label>
            <label>{t("checkout.addressLine2Optional")}<input autoComplete="address-line2" value={form.line2} onChange={(e) => updateField("line2", e.currentTarget.value)} /></label>
            <label>{t("checkout.postalCode")}<input required autoComplete="postal-code" value={form.postalCode} onChange={(e) => updateField("postalCode", e.currentTarget.value)} /></label>
            <label>{t("checkout.city")}<input required autoComplete="address-level2" value={form.city} onChange={(e) => updateField("city", e.currentTarget.value)} /></label>
            <label>{t("checkout.usState")}<input maxLength={3} autoComplete="address-level1" value={form.regionCode} onChange={(e) => updateField("regionCode", e.currentTarget.value)} /></label>
            <label>{t("checkout.country")}<select required autoComplete="country" value={form.countryCode} onChange={(e) => updateField("countryCode", e.currentTarget.value)}>{launchCountries.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
            <button className={styles.button} type="submit" disabled={submitting}>{submitting ? t("checkout.calculatingShipping") : t("checkout.calculateShipping")}</button>
          </form>
        ) : null}
      </section>

      {(order || cart?.lines.length) ? (
        <aside className={styles.summary} aria-label={t("checkout.selection")}>
          <p className={styles.eyebrow}>{t("checkout.selection")}</p>
          {(order?.lines ?? cart?.lines ?? []).map((line, index) => (
            <div className={styles.row} key={"variantId" in line ? line.variantId : `${line.colorName}-${line.size}-${index}`}>
              <span>{line.colorName}<br />Apollon · {t("product.size")} {line.size} × {line.quantity}</span>
              <LocalizedPrice amountCents={line.lineTotalCents} />
            </div>
          ))}
          <div className={styles.row}><span>{t("cart.subtotal")}</span><LocalizedPrice amountCents={subtotal} /></div>
          <div className={styles.row}><span>{t("cart.shipping")}</span><span>{selected || order ? <LocalizedPrice amountCents={shipping} /> : t("cart.toDefine")}</span></div>
          <div className={`${styles.row} ${styles.total}`}><span>{t("checkout.provisionalTotal")}</span><LocalizedPrice amountCents={total} /></div>

          {options && !selected && !order ? (
            <fieldset className={styles.deliveryOptions}>
              <legend>{t("checkout.chooseDelivery")}</legend>
              {options.map((option) => (
                <button className={styles.deliveryOption} type="button" key={option.optionId} disabled={submitting} onClick={() => void choose(option)}>
                  <span><strong>{option.displayName}</strong><small>{option.deliveryMode === "service_point" ? "Point relais" : t("checkout.homeDelivery")} · {option.estimatedDaysMin}–{option.estimatedDaysMax} {t("checkout.days")}</small></span>
                  <LocalizedPrice amountCents={option.amountCents} />
                </button>
              ))}
            </fieldset>
          ) : null}

          {relayOption && points && !selected && !order ? (
            <fieldset className={styles.deliveryOptions}>
              <legend>Choisir un point relais</legend>
              {points.map((point) => (
                <button className={styles.deliveryOption} type="button" key={point.servicePointId} disabled={submitting} onClick={() => void choosePoint(point)}>
                  <span><strong>{point.displayName}</strong><small>{point.postalCode} · {point.city}</small></span>
                </button>
              ))}
            </fieldset>
          ) : null}

          {selected && !order ? (
            <div className={styles.testCheckout}>
              <label>{t("checkout.email")}<input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.currentTarget.value)} /></label>
              <label className={styles.checkbox}><input type="checkbox" checked={legalAccepted} onChange={(e) => setLegalAccepted(e.currentTarget.checked)} /><span>J’accepte les <Link href="/terms">conditions de vente</Link> et la <Link href="/privacy">politique de confidentialité</Link>.</span></label>
              <button className={styles.button} type="button" disabled={submitting || !legalAccepted || !email} onClick={() => void confirmOrder()}>Confirmer la commande</button>
            </div>
          ) : null}

          {order ? (
            <div className={styles.quote} role="status" aria-live="polite">
              <strong>{order.status === "paid" ? "Paiement confirmé" : "Commande réservée"}</strong>
              <p>{order.orderNumber}</p>
              {order.status === "pending_payment" ? <button className={styles.button} type="button" disabled={submitting} onClick={() => void pay()}>Payer avec Stripe</button> : null}
            </div>
          ) : null}
          <p className={styles.muted}>{t("checkout.securityNote")}</p>
        </aside>
      ) : null}
    </div>
  );
}
