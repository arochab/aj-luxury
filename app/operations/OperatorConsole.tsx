"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import styles from "./operations.module.css";

type Order = Readonly<{
  orderId: string;
  orderNumber: string;
  status: string;
  currency: string;
  totalCents: number;
  paidAt: string | null;
  shipment: Readonly<{ id: string; status: string | null }> | null;
  emails: Readonly<{
    orderConfirmation: string | null;
    paymentConfirmation: string | null;
  }>;
}>;

type OrderDetail = Readonly<{
  orderId: string;
  orderNumber: string;
  status: string;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  paidAt: string | null;
  createdAt: string;
  shippingAddress: Readonly<{
    recipient: string;
    line1: string;
    line2: string | null;
    postalCode: string;
    city: string;
    countryCode: string;
  }>;
  items: readonly Readonly<{
    internalReference: string;
    productName: string;
    colorName: string;
    size: string;
    quantity: number;
  }>[];
  shipment: Readonly<{
    id: string;
    status: string | null;
    trackingProviderCode: string | null;
    trackingReference: string | null;
  }> | null;
}>;

type Promotion = Readonly<{
  id: string;
  code: string;
  kind: "percentage" | "fixed";
  percentageBasisPoints: number | null;
  fixedDiscountCents: number | null;
  minimumSubtotalCents: number;
  maximumDiscountCents: number | null;
  maximumRedemptions: number | null;
  active: boolean;
  startsAt: string;
  endsAt: string | null;
  reservedCount: number;
  redeemedCount: number;
}>;

type ConsoleState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{
    kind: "ready";
    orders: readonly Order[];
    promotions: readonly Promotion[];
    csrfToken: string;
  }>
  | Readonly<{ kind: "error"; message: string }>;

function readCookie(name: string): string | null {
  const values = document.cookie.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    return separator >= 1 && part.slice(0, separator).trim() === name
      ? [part.slice(separator + 1).trim()]
      : [];
  });
  return values.length === 1 ? values[0] : null;
}

async function parseError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as {
    error?: { code?: string };
  } | null;
  return body?.error?.code ?? `HTTP_${response.status}`;
}

function operatorMessage(code: string): string {
  if (code === "FRESH_ACCESS_REQUIRED") {
    return "Votre connexion administrateur n’est plus assez récente. Reconnectez-vous via Cloudflare Access.";
  }
  if (["CLOUDFLARE_ACCESS_REQUIRED", "OWNER_SESSION_REQUIRED"].includes(code)) {
    return "Accès opérateur requis. Ouvrez cette page après votre authentification Cloudflare Access.";
  }
  if (code === "OPERATOR_CONSOLE_CLOSED") {
    return "La console est fermée tant que sa recette de sécurité n’est pas validée.";
  }
  return "La console n’est pas disponible. Aucune commande ni étiquette n’a été modifiée.";
}

function deliveryLabel(order: Order): string {
  if (order.status === "refunded") return "commande remboursée — ne pas expédier";
  if (!order.shipment) return "aucune étiquette créée";
  if (order.shipment.status === "label_pending") return "création d’étiquette en cours";
  if (order.shipment.status === "label_ready") return "étiquette prête";
  if (["handed_over", "in_transit"].includes(order.shipment.status ?? "")) {
    return "remise transporteur confirmée";
  }
  if (order.shipment.status === "delivered") return "livrée";
  if (order.shipment.status === "label_claimed") {
    return "vérification transporteur requise — ne pas recréer";
  }
  if (order.shipment.status === "failed") return "échec transporteur — intervention requise";
  return "contrôle manuel requis";
}

function labelReadyForFulfillment(order: Order): boolean {
  return ["paid", "preparing"].includes(order.status) &&
    order.shipment?.status === "label_ready";
}

function paymentLabel(order: Order): string {
  return order.status === "refunded" ? "remboursé" : "réglé";
}

function emailLabel(order: Order): string {
  const confirmed = [order.emails.orderConfirmation, order.emails.paymentConfirmation]
    .filter((value) => value === "sent" || value === "confirmed").length;
  return `${confirmed}/2 confirmés`;
}

function amount(order: Pick<Order, "currency" | "totalCents">): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: order.currency,
  }).format(order.totalCents / 100);
}

export default function OperatorConsole() {
  const [state, setState] = useState<ConsoleState>({ kind: "loading" });
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [busyHandover, setBusyHandover] = useState<string | null>(null);
  const [busyDetail, setBusyDetail] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, OrderDetail>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [promotionBusy, setPromotionBusy] = useState(false);
  const [promotionCode, setPromotionCode] = useState("");
  const [promotionKind, setPromotionKind] = useState<"percentage" | "fixed">("percentage");
  const [promotionValue, setPromotionValue] = useState("10");
  const [promotionMinimum, setPromotionMinimum] = useState("0");
  const [promotionMaximumDiscount, setPromotionMaximumDiscount] = useState("");
  const [promotionMaximumRedemptions, setPromotionMaximumRedemptions] = useState("");
  const [promotionEndsAt, setPromotionEndsAt] = useState("");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    let response = await fetch("/api/commerce/admin/orders", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.status === 403) {
      const session = await fetch("/api/commerce/admin/session", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!session.ok) {
        setState({ kind: "error", message: operatorMessage(await parseError(session)) });
        return;
      }
      response = await fetch("/api/commerce/admin/orders", {
        credentials: "same-origin",
        cache: "no-store",
      });
    }
    if (!response.ok) {
      setState({ kind: "error", message: operatorMessage(await parseError(response)) });
      return;
    }
    const promotionsResponse = await fetch("/api/commerce/admin/promotions", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!promotionsResponse.ok) {
      setState({ kind: "error", message: operatorMessage(await parseError(promotionsResponse)) });
      return;
    }
    const payload = await response.json() as { data: readonly Order[] };
    const promotionsPayload = await promotionsResponse.json() as { data: readonly Promotion[] };
    const csrfToken = readCookie("__Host-aj_admin_csrf");
    if (!csrfToken) {
      setState({ kind: "error", message: "La session opérateur est incomplète. Aucune action n’est possible." });
      return;
    }
    setState({
      kind: "ready",
      orders: payload.data,
      promotions: promotionsPayload.data,
      csrfToken,
    });
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(task);
  }, [load]);

  async function downloadLabel(order: Order, csrfToken: string) {
    if (!labelReadyForFulfillment(order)) return;
    setBusyOrder(order.orderId);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/commerce/admin/orders/${encodeURIComponent(order.orderId)}/shipping-label`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "X-CSRF-Token": csrfToken,
            "Idempotency-Key": `operator-label:${order.orderId}`,
            "X-AJ-Download-Request-Id": `label-download:${crypto.randomUUID()}`,
          },
        },
      );
      if (!response.ok) throw new Error(await parseError(response));
      const blob = await response.blob();
      if (blob.type !== "application/pdf") throw new Error("SHIPPING_DOCUMENT_UNAVAILABLE");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `AJL-${order.orderNumber}-A4.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      await load();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "SHIPPING_DOCUMENT_UNAVAILABLE";
      setActionError(code === "MANUAL_RECONCILIATION_REQUIRED"
        ? "Résultat transporteur à vérifier. Ne recliquez pas : aucune deuxième étiquette ne doit être créée."
        : "L’étiquette n’a pas pu être récupérée. Aucune deuxième création n’a été lancée.");
    } finally {
      setBusyOrder(null);
    }
  }

  async function loadDetail(order: Order) {
    if (expandedOrder === order.orderId) {
      setExpandedOrder(null);
      return;
    }
    setExpandedOrder(order.orderId);
    if (details[order.orderId]) return;
    setBusyDetail(order.orderId);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/commerce/admin/orders/${encodeURIComponent(order.orderId)}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!response.ok) throw new Error(await parseError(response));
      const payload = await response.json() as { data: OrderDetail };
      setDetails((current) => ({ ...current, [order.orderId]: payload.data }));
    } catch {
      setExpandedOrder(null);
      setActionError("Le détail sécurisé de la commande n’est pas disponible. Aucune donnée n’a été modifiée.");
    } finally {
      setBusyDetail(null);
    }
  }

  async function handoverShipment(order: Order, csrfToken: string) {
    if (!order.shipment || !labelReadyForFulfillment(order)) return;
    if (!window.confirm(
      `Confirmer que le colis ${order.orderNumber} a été physiquement remis au transporteur ?`,
    )) return;
    setBusyHandover(order.orderId);
    setActionError(null);
    try {
      const eventId = `handover_${crypto.randomUUID().replaceAll("-", "")}`;
      const response = await fetch(
        `/api/commerce/admin/shipments/${encodeURIComponent(order.shipment.id)}/handover`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
            "Idempotency-Key": `shipment-handover:${eventId}`,
          },
          body: JSON.stringify({ eventId, locale: "fr" }),
        },
      );
      if (!response.ok) throw new Error(await parseError(response));
      setDetails({});
      setExpandedOrder(null);
      await load();
    } catch {
      setActionError("La remise transporteur n’a pas été enregistrée. Le statut de la commande reste inchangé.");
    } finally {
      setBusyHandover(null);
    }
  }

  async function createPromotion() {
    if (state.kind !== "ready" || promotionBusy) return;
    const value = Number(promotionValue);
    const minimum = Number(promotionMinimum || "0");
    const maximumDiscount = promotionMaximumDiscount
      ? Number(promotionMaximumDiscount)
      : null;
    const maximumRedemptions = promotionMaximumRedemptions
      ? Number(promotionMaximumRedemptions)
      : null;
    if (!promotionCode.trim() || !Number.isFinite(value) || value <= 0 ||
      !Number.isFinite(minimum) || minimum < 0 ||
      (maximumDiscount !== null && (!Number.isFinite(maximumDiscount) || maximumDiscount <= 0)) ||
      (maximumRedemptions !== null && (!Number.isInteger(maximumRedemptions) || maximumRedemptions <= 0))) {
      setActionError("Vérifiez le code, la remise et ses limites avant de l’enregistrer.");
      return;
    }
    let endsAt: string | null = null;
    if (promotionEndsAt) {
      const date = new Date(promotionEndsAt);
      if (Number.isNaN(date.getTime()) || date <= new Date()) {
        setActionError("La date de fin doit être dans le futur.");
        return;
      }
      endsAt = date.toISOString();
    }
    setPromotionBusy(true);
    setActionError(null);
    try {
      const response = await fetch("/api/commerce/admin/promotions", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": state.csrfToken,
        },
        body: JSON.stringify({
          code: promotionCode.trim().toUpperCase(),
          kind: promotionKind,
          percentageBasisPoints: promotionKind === "percentage" ? Math.round(value * 100) : null,
          fixedDiscountCents: promotionKind === "fixed" ? Math.round(value * 100) : null,
          minimumSubtotalCents: Math.round(minimum * 100),
          maximumDiscountCents: maximumDiscount === null
            ? null
            : Math.round(maximumDiscount * 100),
          maximumRedemptions,
          startsAt: new Date().toISOString(),
          endsAt,
        }),
      });
      if (!response.ok) throw new Error(await parseError(response));
      setPromotionCode("");
      setPromotionValue("10");
      setPromotionMinimum("0");
      setPromotionMaximumDiscount("");
      setPromotionMaximumRedemptions("");
      setPromotionEndsAt("");
      await load();
    } catch (cause) {
      setActionError(cause instanceof Error && cause.message === "PROMOTION_ALREADY_EXISTS"
        ? "Ce code existe déjà. Réactivez-le dans la liste ou choisissez un autre code."
        : "Le code promo n’a pas été créé. Aucun changement partiel n’a été conservé.");
    } finally {
      setPromotionBusy(false);
    }
  }

  async function setPromotionActive(promotion: Promotion) {
    if (state.kind !== "ready" || promotionBusy) return;
    setPromotionBusy(true);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/commerce/admin/promotions/${encodeURIComponent(promotion.id)}/status`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": state.csrfToken,
          },
          body: JSON.stringify({ active: !promotion.active }),
        },
      );
      if (!response.ok) throw new Error(await parseError(response));
      await load();
    } catch {
      setActionError("Le statut du code promo n’a pas été modifié.");
    } finally {
      setPromotionBusy(false);
    }
  }

  async function signOut() {
    if (state.kind !== "ready") return;
    await fetch("/api/commerce/admin/session", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "X-CSRF-Token": state.csrfToken },
    }).catch(() => null);
    window.location.assign("/cdn-cgi/access/logout");
  }

  const orders = state.kind === "ready" ? state.orders : [];
  const promotions = state.kind === "ready" ? state.promotions : [];
  const actionableOrders = orders.filter((order) => ["paid", "preparing"].includes(order.status));

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>AJ LUXURY</span>
        <nav aria-label="Navigation opérateur" className={styles.nav}>
          <span aria-current="page">Opérations</span>
          <button type="button" onClick={() => void signOut()}>Déconnexion</button>
        </nav>
      </header>

      <section className={styles.content}>
        <h1>Commandes et expéditions</h1>
        <p className={styles.summary}>
          {actionableOrders.length} commande(s) à préparer sur {orders.length} commande(s) suivie(s).<br />
          Quand l’étiquette est prête, vérifiez les articles, imprimez l’A4, puis confirmez la remise physique au transporteur.
        </p>

        {state.kind === "loading" ? <p className={styles.notice}>Chargement sécurisé…</p> : null}
        {state.kind === "error" ? (
          <div className={styles.notice} role="alert">
            <p>{state.message}</p>
            <button type="button" onClick={() => void load()}>Réessayer</button>
          </div>
        ) : null}
        {actionError ? <p className={styles.actionError} role="alert">{actionError}</p> : null}

        {state.kind === "ready" ? (
          <div className={styles.table} role="table" aria-label="Commandes payées et expéditions">
            <div className={styles.tableHeader} role="row">
              <span role="columnheader">Commande</span>
              <span role="columnheader">Paiement</span>
              <span role="columnheader">E-mails</span>
              <span role="columnheader">Livraison</span>
              <span role="columnheader">Montant</span>
              <span role="columnheader">Actions</span>
            </div>
            {orders.map((order) => (
              <Fragment key={order.orderId}>
                <article className={styles.row} role="row">
                  <span className={styles.orderNumber} role="cell" data-label="Commande">{order.orderNumber}</span>
                  <span role="cell" data-label="Paiement">{paymentLabel(order)}</span>
                  <span role="cell" data-label="E-mails">{emailLabel(order)}</span>
                  <span className={styles.delivery} role="cell" data-label="Livraison">{deliveryLabel(order)}</span>
                  <span role="cell" data-label="Montant">{amount(order)}</span>
                  <span role="cell" data-label="Actions">
                    <span className={styles.actions}>
                      <button
                        className={styles.secondary}
                        type="button"
                        disabled={busyDetail !== null}
                        onClick={() => void loadDetail(order)}
                      >
                        {busyDetail === order.orderId
                          ? "Chargement…"
                          : expandedOrder === order.orderId ? "Masquer le détail" : "Voir le détail"}
                      </button>
                      {labelReadyForFulfillment(order) ? (
                        <button
                          className={styles.download}
                          type="button"
                          disabled={busyOrder !== null || busyHandover !== null}
                          onClick={() => void downloadLabel(order, state.csrfToken)}
                        >
                          {busyOrder === order.orderId ? "Récupération…" : "Télécharger l’étiquette A4"}
                        </button>
                      ) : null}
                      {labelReadyForFulfillment(order) ? (
                        <button
                          className={styles.secondary}
                          type="button"
                          disabled={busyOrder !== null || busyHandover !== null}
                          onClick={() => void handoverShipment(order, state.csrfToken)}
                        >
                          {busyHandover === order.orderId ? "Confirmation…" : "Confirmer la remise"}
                        </button>
                      ) : null}
                      {["handed_over", "in_transit", "delivered"].includes(order.shipment?.status ?? "")
                        ? <span className={styles.complete}>suivi actif</span> : null}
                    </span>
                  </span>
                </article>
                {expandedOrder === order.orderId ? (
                  <section className={styles.detail} aria-label={`Détail de la commande ${order.orderNumber}`}>
                    {details[order.orderId] ? (
                      <>
                        <div>
                          <h2>Articles à préparer</h2>
                          <ul>
                            {details[order.orderId].items.map((item) => (
                              <li key={item.internalReference}>
                                <strong>{item.quantity} × {item.productName}</strong>
                                <span>{item.colorName} · taille {item.size} · {item.internalReference}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h2>Destination</h2>
                          <address>
                            {details[order.orderId].shippingAddress.recipient}<br />
                            {details[order.orderId].shippingAddress.line1}<br />
                            {details[order.orderId].shippingAddress.line2
                              ? <>{details[order.orderId].shippingAddress.line2}<br /></> : null}
                            {details[order.orderId].shippingAddress.postalCode} {details[order.orderId].shippingAddress.city}<br />
                            {details[order.orderId].shippingAddress.countryCode}
                          </address>
                          {details[order.orderId].shipment?.trackingReference ? (
                            <p>
                              suivi : {details[order.orderId].shipment?.trackingProviderCode ?? "transporteur"} · {details[order.orderId].shipment?.trackingReference}
                            </p>
                          ) : <p>numéro de suivi en attente</p>}
                        </div>
                      </>
                    ) : <p>Chargement du détail sécurisé…</p>}
                  </section>
                ) : null}
              </Fragment>
            ))}
            {orders.length === 0 ? <p className={styles.empty}>Aucune commande payée à suivre.</p> : null}
          </div>
        ) : null}

        {state.kind === "ready" ? (
          <section className={styles.promotions} aria-labelledby="promotions-title">
            <div className={styles.sectionHeading}>
              <div>
                <p>Vente</p>
                <h2 id="promotions-title">Codes promo</h2>
              </div>
              <span>{promotions.filter((promotion) => promotion.active).length} actif(s)</span>
            </div>

            <form className={styles.promotionForm} onSubmit={(event) => {
              event.preventDefault();
              void createPromotion();
            }}>
              <label>Code<input required autoComplete="off" minLength={3} maxLength={32} name="promotionCode" pattern="[A-Za-z0-9_-]+" placeholder="ex. BIENVENUE10…" spellCheck={false} value={promotionCode} onChange={(event) => setPromotionCode(event.currentTarget.value.toUpperCase())} /></label>
              <label>Type<select autoComplete="off" name="promotionKind" value={promotionKind} onChange={(event) => setPromotionKind(event.currentTarget.value as "percentage" | "fixed")}><option value="percentage">Pourcentage</option><option value="fixed">Montant fixe</option></select></label>
              <label>{promotionKind === "percentage" ? "Remise (%)" : "Remise (€)"}<input required autoComplete="off" inputMode="decimal" name="promotionValue" type="number" min="0.01" max={promotionKind === "percentage" ? "100" : "10000"} step="0.01" value={promotionValue} onChange={(event) => setPromotionValue(event.currentTarget.value)} /></label>
              <label>Panier minimum (€)<input required autoComplete="off" inputMode="decimal" name="promotionMinimum" type="number" min="0" max="10000" step="0.01" value={promotionMinimum} onChange={(event) => setPromotionMinimum(event.currentTarget.value)} /></label>
              <label>Plafond remise (€)<input autoComplete="off" inputMode="decimal" name="promotionMaximumDiscount" type="number" min="0.01" max="10000" step="0.01" placeholder="Facultatif…" value={promotionMaximumDiscount} onChange={(event) => setPromotionMaximumDiscount(event.currentTarget.value)} /></label>
              <label>Nombre d’utilisations<input autoComplete="off" inputMode="numeric" name="promotionMaximumRedemptions" type="number" min="1" max="1000000" step="1" placeholder="Illimité…" value={promotionMaximumRedemptions} onChange={(event) => setPromotionMaximumRedemptions(event.currentTarget.value)} /></label>
              <label>Fin du code<input autoComplete="off" name="promotionEndsAt" type="datetime-local" value={promotionEndsAt} onChange={(event) => setPromotionEndsAt(event.currentTarget.value)} /></label>
              <button className={styles.download} type="submit" disabled={promotionBusy}>{promotionBusy ? "Enregistrement…" : "Créer le code"}</button>
            </form>

            <div className={styles.promotionList}>
              {promotions.map((promotion) => (
                <article key={promotion.id} className={styles.promotionCard}>
                  <div>
                    <strong>{promotion.code}</strong>
                    <span>{promotion.kind === "percentage"
                      ? `${(promotion.percentageBasisPoints ?? 0) / 100} %`
                      : amount({ currency: "EUR", totalCents: promotion.fixedDiscountCents ?? 0 })}</span>
                  </div>
                  <p>
                    {promotion.redeemedCount} utilisée(s) · {promotion.reservedCount} réservée(s)
                    {promotion.maximumRedemptions ? ` · limite ${promotion.maximumRedemptions}` : " · sans limite"}
                  </p>
                  <button className={styles.secondary} type="button" disabled={promotionBusy} onClick={() => void setPromotionActive(promotion)}>
                    {promotion.active ? "Désactiver" : "Réactiver"}
                  </button>
                </article>
              ))}
              {promotions.length === 0 ? <p className={styles.empty}>Aucun code promo créé.</p> : null}
            </div>
          </section>
        ) : null}

        <p className={styles.reminder}>
          Une étiquette n’est jamais recréée depuis cet écran. Si le transporteur répond de façon ambiguë, la commande est bloquée pour vérification manuelle.
        </p>

        <dl className={styles.key}>
          <div><dt>création en cours</dt><dd>attendre sans relancer</dd></div>
          <div><dt>étiquette prête</dt><dd>impression A4 puis remise</dd></div>
          <div><dt>remise confirmée</dt><dd>suivi transporteur actif</dd></div>
        </dl>
      </section>
    </main>
  );
}
