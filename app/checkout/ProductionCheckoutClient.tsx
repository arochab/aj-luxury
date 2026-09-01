"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
  changeProductionOrderDelivery,
  createProductionOrder,
  createProductionPaymentSession,
  getCurrentProductionOrder,
  quoteProductionPromotion,
  ProductionOrderApiError,
  type PublicPromotionQuote,
  type PublicProductionOrder,
} from "../../lib/commerce/production-order-client";
import { useI18n } from "../../lib/i18n/I18nProvider";
import LocalizedPrice from "../components/LocalizedPrice";
import {
  CustomerAccountApiError,
  getCustomerAccount,
  loginCustomerAccount,
  registerCustomerAccount,
} from "../../lib/commerce/customer-account-client.ts";
import styles from "../cart/CommerceShell.module.css";

const euLaunchCountries = Object.freeze([
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
const internationalLaunchCountries = Object.freeze([
  ["GB", "Royaume-Uni"], ["US", "États-Unis"], ["CA", "Canada"],
  ["AE", "Émirats arabes unis"], ["QA", "Qatar"], ["SA", "Arabie saoudite"],
] as const);
const internationalCheckoutEnabled =
  process.env.NEXT_PUBLIC_INTERNATIONAL_SHIPPING_ENABLED === "true";
const launchCountries = internationalCheckoutEnabled
  ? Object.freeze([...euLaunchCountries, ...internationalLaunchCountries])
  : euLaunchCountries;
const internationalCountries: ReadonlySet<string> = new Set(
  internationalLaunchCountries.map(([countryCode]) => countryCode),
);

function accountAccessHref(view: "login" | "forgot", email: string): string {
  const params = new URLSearchParams({ view, returnTo: "/checkout" });
  const normalizedEmail = email.trim();
  if (normalizedEmail) params.set("email", normalizedEmail);
  return `/account?${params.toString()}`;
}

type AddressForm = {
  recipient: string;
  company: string;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  regionCode: string;
  countryCode: string;
  phone: string;
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
  phone: "",
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
    ...(value.phone.trim() ? { phone: value.phone.trim() } : {}),
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
  const [promotionInput, setPromotionInput] = useState("");
  const [promotion, setPromotion] = useState<PublicPromotionQuote | null>(null);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [dutiesAccepted, setDutiesAccepted] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirmation, setAccountPasswordConfirmation] = useState("");
  const [acceptsMarketing, setAcceptsMarketing] = useState(false);
  const [accountPrepared, setAccountPrepared] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const quoteAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const selectAttempt = useRef<{ optionId: string; key: string } | null>(null);
  const pointsAttempt = useRef<{ optionId: string; key: string } | null>(null);
  const orderAttempt = useRef<string | null>(null);
  const promotionAttempt = useRef<{ code: string; key: string } | null>(null);
  const paymentAttempt = useRef<string | null>(null);
  const deliveryChangeAttempt = useRef<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorCode(null);
    try {
      const [currentOrder, currentAccount] = await Promise.all([
        getCurrentProductionOrder(),
        getCustomerAccount().catch(() => null),
      ]);
      setOrder(currentOrder);
      setSignedInEmail(currentAccount?.email ?? null);
      if (currentAccount?.email) setEmail(currentAccount.email);
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

  async function requestOptions() {
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
    const international = internationalCountries.has(form.countryCode);
    if (!selected || !legalAccepted || (international && !dutiesAccepted) || !email || submitting) return;
    setSubmitting(true);
    setErrorCode(null);
    try {
      if (!signedInEmail && !accountPrepared) {
        if (accountPassword !== accountPasswordConfirmation || accountPassword.length < 12) {
          setErrorCode("ACCOUNT_PASSWORD_INVALID");
          return;
        }
        try {
          await loginCustomerAccount(email, accountPassword);
          setSignedInEmail(email);
        } catch (error) {
          if (!(error instanceof CustomerAccountApiError) || error.code !== "INVALID_CREDENTIALS") {
            throw error;
          }
          await registerCustomerAccount({
            email,
            password: accountPassword,
            acceptsMarketing,
            source: "checkout",
          });
        }
        setAccountPrepared(true);
      }
      const key = orderAttempt.current ?? crypto.randomUUID();
      orderAttempt.current = key;
      setOrder(await createProductionOrder({
        quoteId: selected.quoteId,
        optionId: selected.optionId,
        address: shippingAddress(form),
        email,
        idempotencyKey: key,
        ...(promotion ? { promotionCode: promotion.code } : {}),
        ...(selectedPoint ? { servicePointId: selectedPoint.servicePointId } : {}),
      }));
    } catch (error) {
      setErrorCode(error instanceof ProductionOrderApiError || error instanceof CustomerAccountApiError
        ? error.code
        : "CHECKOUT_UNAVAILABLE");
    } finally {
      setSubmitting(false);
    }
  }

  async function applyPromotion() {
    const code = promotionInput.trim().toUpperCase();
    if (!code || submitting || order) return;
    const key = promotionAttempt.current?.code === code
      ? promotionAttempt.current.key
      : crypto.randomUUID();
    promotionAttempt.current = { code, key };
    setSubmitting(true);
    setErrorCode(null);
    try {
      const quoted = await quoteProductionPromotion(code, key);
      setPromotionInput(quoted.code);
      setPromotion(quoted);
      orderAttempt.current = null;
    } catch (error) {
      setPromotion(null);
      if (error instanceof ProductionOrderApiError && error.code === "PROMOTION_REJECTED") {
        promotionAttempt.current = null;
      }
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

  async function changeDelivery() {
    if (!order || submitting ||
      !["pending_payment", "cancelled"].includes(order.status)) return;
    setSubmitting(true);
    setErrorCode(null);
    try {
      const key = deliveryChangeAttempt.current ?? crypto.randomUUID();
      deliveryChangeAttempt.current = key;
      await changeProductionOrderDelivery(key);
      const nextCart = await getCart("production");
      setCart(nextCart);
      setOrder(null);
      setOptions(null);
      setSelected(null);
      setRelayOption(null);
      setPoints(null);
      setSelectedPoint(null);
      setPromotion(null);
      setPromotionInput("");
      setLegalAccepted(false);
      setDutiesAccepted(false);
      quoteAttempt.current = null;
      selectAttempt.current = null;
      pointsAttempt.current = null;
      orderAttempt.current = null;
      promotionAttempt.current = null;
      paymentAttempt.current = null;
      deliveryChangeAttempt.current = null;
    } catch (error) {
      setErrorCode(error instanceof ProductionOrderApiError
        ? error.code
        : "CHECKOUT_UNAVAILABLE");
    } finally {
      setSubmitting(false);
    }
  }

  const merchandiseSubtotal = order
    ? order.subtotalCents + order.promotionDiscountCents
    : cart?.subtotalCents ?? 0;
  const promotionDiscount = order?.promotionDiscountCents ?? promotion?.discountCents ?? 0;
  const subtotal = order?.subtotalCents ?? promotion?.subtotalAfterDiscountCents ?? merchandiseSubtotal;
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
          : errorCode === "ACCOUNT_PASSWORD_INVALID"
            ? "Choisissez deux mots de passe identiques d’au moins 12 caractères."
            : errorCode === "INVALID_ACCOUNT_INPUT"
              ? "Vérifiez votre e-mail et votre mot de passe."
              : errorCode === "ACCOUNT_AUTHENTICATION_REQUIRED"
              ? "Cette adresse possède déjà un compte. Connectez-vous ou utilisez « Mot de passe oublié » avant de confirmer la commande."
              : errorCode === "PROMOTION_REJECTED"
                ? "Ce code promo n’est pas valide, n’est plus actif ou ne s’applique pas à ce panier."
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
            <button
              type="button"
              disabled={submitting}
              onClick={() => void (
                order && ["pending_payment", "cancelled"].includes(order.status)
                  ? changeDelivery()
                  : cart?.lines.length
                    ? requestOptions()
                    : load()
              )}
            >
              {t("cart.retry")}
            </button>
          </div>
        )}
        {!loading && !order && cart?.lines.length ? (
          <form className={styles.form} onSubmit={(event) => {
            event.preventDefault();
            void requestOptions();
          }}>
            <label>{t("checkout.recipient")}<input required autoComplete="name" value={form.recipient} onChange={(e) => updateField("recipient", e.currentTarget.value)} /></label>
            <label>{t("checkout.companyOptional")}<input autoComplete="organization" value={form.company} onChange={(e) => updateField("company", e.currentTarget.value)} /></label>
            <label>{t("checkout.address")}<input required autoComplete="address-line1" value={form.line1} onChange={(e) => updateField("line1", e.currentTarget.value)} /></label>
            <label>{t("checkout.addressLine2Optional")}<input autoComplete="address-line2" value={form.line2} onChange={(e) => updateField("line2", e.currentTarget.value)} /></label>
            <label>{t("checkout.postalCode")}{["AE", "QA"].includes(form.countryCode) ? " (facultatif)" : ""}<input required={!['AE', 'QA'].includes(form.countryCode)} autoComplete="postal-code" value={form.postalCode} onChange={(e) => updateField("postalCode", e.currentTarget.value)} /></label>
            <label>{t("checkout.city")}<input required autoComplete="address-level2" value={form.city} onChange={(e) => updateField("city", e.currentTarget.value)} /></label>
            {["US", "CA"].includes(form.countryCode) ? <label>{form.countryCode === "US" ? "État (code à 2 lettres)" : "Province (code à 2 lettres)"}<input required maxLength={2} autoComplete="address-level1" value={form.regionCode} onChange={(e) => updateField("regionCode", e.currentTarget.value)} /></label> : null}
            <label>{t("checkout.mobilePhone")}<input required type="tel" inputMode="tel" autoComplete="tel" pattern="\+[1-9][0-9]{7,14}" title="Format international, par exemple +33612345678" placeholder="+33612345678" value={form.phone} onChange={(e) => updateField("phone", e.currentTarget.value)} /></label>
            <label>{t("checkout.country")}<select required autoComplete="country" value={form.countryCode} onChange={(e) => updateField("countryCode", e.currentTarget.value)}>{launchCountries.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
            <p className={styles.accountEmailNotice}>
              <strong>Adresse de facturation</strong> Cette adresse et le nom
              renseigné seront repris sur votre facture A4. Vérifiez-les avant
              de calculer la livraison ; le champ société reste facultatif.
            </p>
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
          <div className={styles.row}><span>{t("cart.subtotal")}</span><LocalizedPrice amountCents={merchandiseSubtotal} /></div>
          {promotionDiscount > 0 ? (
            <div className={`${styles.row} ${styles.promotionDiscount}`}>
              <span>Code {order?.promotionCode ?? promotion?.code}</span>
              <span>−<LocalizedPrice amountCents={promotionDiscount} /></span>
            </div>
          ) : null}
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
            <form className={styles.testCheckout} onSubmit={(event) => { event.preventDefault(); void confirmOrder(); }}>
              <section className={styles.promotion} aria-labelledby="checkout-promotion-title">
                <div>
                  <p className={styles.accountCheckoutEyebrow}>Avantage</p>
                  <h2 id="checkout-promotion-title">Code promo</h2>
                </div>
                <div className={styles.promotionEntry}>
                  <label>
                    <span className={styles.srOnly}>Code promo</span>
                    <input
                      autoCapitalize="characters"
                      autoComplete="off"
                      inputMode="text"
                      maxLength={32}
                      name="promotionCode"
                      placeholder="VOTRE CODE…"
                      spellCheck={false}
                      value={promotionInput}
                      onChange={(event) => {
                        setPromotionInput(event.currentTarget.value.toUpperCase());
                        setPromotion(null);
                        promotionAttempt.current = null;
                        orderAttempt.current = null;
                      }}
                    />
                  </label>
                  <button type="button" disabled={submitting || !promotionInput.trim()} onClick={() => void applyPromotion()}>
                    {submitting ? "Vérification…" : promotion ? "Appliqué" : "Appliquer"}
                  </button>
                </div>
                {promotion ? <p className={styles.promotionSuccess} role="status" aria-live="polite">Code validé · remise de <LocalizedPrice amountCents={promotion.discountCents} /></p> : null}
              </section>
              {signedInEmail ? (
                <section className={styles.accountCheckoutFields} aria-labelledby="checkout-account-title">
                  <div className={styles.accountCheckoutHeading}>
                    <div>
                      <p className={styles.accountCheckoutEyebrow}>Compte client</p>
                      <h2 id="checkout-account-title">Votre espace client</h2>
                    </div>
                    <span className={styles.accountCheckoutStatus}>Connecté</span>
                  </div>
                  <label>{t("checkout.email")}<input type="email" inputMode="email" autoComplete="email" readOnly value={email} /></label>
                  <p className={styles.accountCheckoutIntro}>Cette commande et sa facture A4 seront ajoutées automatiquement à votre historique après confirmation du paiement.</p>
                </section>
              ) : (
                <section className={styles.accountCheckoutFields} aria-labelledby="checkout-account-title">
                  <div className={styles.accountCheckoutHeading}>
                    <div>
                      <p className={styles.accountCheckoutEyebrow}>Compte client</p>
                      <h2 id="checkout-account-title">Créer votre espace</h2>
                    </div>
                    <nav className={styles.accountCheckoutLinks} aria-label="Accès à votre compte">
                      <Link href={accountAccessHref("login", email)}>Se connecter</Link>
                      <Link href={accountAccessHref("forgot", email)}>Mot de passe oublié</Link>
                    </nav>
                  </div>
                  <p className={styles.accountCheckoutIntro}>Retrouvez votre commande, sa facture A4, son paiement et sa livraison depuis un espace sécurisé.</p>
                  <label>{t("checkout.email")}<input type="email" inputMode="email" autoComplete="email" required aria-describedby="checkout-account-email-help" value={email} onChange={(e) => { setEmail(e.currentTarget.value); setAccountPrepared(false); }} /></label>
                  <label>Choisir un mot de passe <span className={styles.fieldHint}>12 caractères minimum</span><input type="password" minLength={12} maxLength={128} autoComplete="new-password" required value={accountPassword} onChange={(e) => { setAccountPassword(e.currentTarget.value); setAccountPrepared(false); }} /></label>
                  <label>Confirmer le mot de passe<input type="password" minLength={12} maxLength={128} autoComplete="new-password" required value={accountPasswordConfirmation} onChange={(e) => { setAccountPasswordConfirmation(e.currentTarget.value); setAccountPrepared(false); }} /></label>
                  <p className={styles.accountEmailNotice} id="checkout-account-email-help"><strong>Après cette étape</strong> Un e-mail AJ Luxury vous sera envoyé. Confirmez votre adresse pour activer l’espace et retrouver cette commande.</p>
                  <label className={styles.checkbox}><input type="checkbox" checked={acceptsMarketing} onChange={(e) => { setAcceptsMarketing(e.currentTarget.checked); setAccountPrepared(false); }} /><span>Recevoir les nouveautés AJ Luxury. Facultatif et révocable.</span></label>
                </section>
              )}
              <label className={styles.checkbox}><input type="checkbox" checked={legalAccepted} onChange={(e) => setLegalAccepted(e.currentTarget.checked)} /><span>J’accepte les <Link href="/terms">conditions de vente</Link> et la <Link href="/privacy">politique de confidentialité</Link>.</span></label>
              {internationalCountries.has(form.countryCode) ? <label className={styles.checkbox}><input type="checkbox" required checked={dutiesAccepted} onChange={(e) => setDutiesAccepted(e.currentTarget.checked)} /><span>Je comprends que cette livraison est expédiée en DAP : les droits, taxes et frais d’importation éventuels restent à ma charge à l’arrivée.</span></label> : null}
              <button className={styles.button} type="submit" disabled={submitting || !legalAccepted || (internationalCountries.has(form.countryCode) && !dutiesAccepted) || !email || (!signedInEmail && (!accountPassword || !accountPasswordConfirmation))}>{signedInEmail ? "Confirmer la commande" : "Créer mon compte et continuer"}</button>
            </form>
          ) : null}

          {order ? (
            <div className={styles.quote} role="status" aria-live="polite">
              <strong>{order.status === "paid"
                ? "Paiement confirmé"
                : order.status === "cancelled"
                  ? "Commande annulée"
                  : "Commande réservée"}</strong>
              <p>{order.orderNumber}</p>
              {order.status === "pending_payment" ? <button className={styles.button} type="button" disabled={submitting} onClick={() => void pay()}>Payer avec Stripe</button> : null}
              {["pending_payment", "cancelled"].includes(order.status) ? <button className={styles.button} type="button" disabled={submitting} onClick={() => void changeDelivery()}>Modifier la livraison</button> : null}
            </div>
          ) : null}
          <p className={styles.muted}>{t("checkout.securityNote")}</p>
        </aside>
      ) : null}
    </div>
  );
}
