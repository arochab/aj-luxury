"use client";

import { Fragment, type FormEvent, useCallback, useEffect, useState } from "react";
import styles from "./operations.module.css";

const ADMIN_API = "/api/commerce/management";

type Order = Readonly<{
  orderId: string;
  orderNumber: string;
  status: string;
  currency: string;
  totalCents: number;
  paidAt: string | null;
  shipment: Readonly<{
    id: string;
    status: string | null;
    retryAllowed: boolean;
    labelEmailStatus: string | null;
    zone: string | null;
    customsStatus: string | null;
  }> | null;
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
    zone: string | null;
    customsStatus: string | null;
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

type InventoryItem = Readonly<{
  internalReference: string;
  productName: string;
  colorName: string;
  size: string;
  physicalQuantity: number;
  giftReserveQuantity: number;
  safetyReserveQuantity: number;
  activeReservedQuantity: number;
  soldQuantity: number;
  availableQuantity: number;
  updatedAt: string;
}>;

type Inventory = Readonly<{
  totals: Readonly<{
    physicalQuantity: number;
    giftReserveQuantity: number;
    safetyReserveQuantity: number;
    activeReservedQuantity: number;
    soldQuantity: number;
    availableQuantity: number;
  }>;
  items: readonly InventoryItem[];
}>;

type ConsoleState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "unauthenticated"; message: string | null }>
  | Readonly<{
    kind: "ready";
    orders: readonly Order[];
    promotions: readonly Promotion[];
    inventory: Inventory;
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
  if (["INVALID_ADMIN_CREDENTIALS", "OWNER_SESSION_REQUIRED"].includes(code)) {
    return "Adresse ou mot de passe incorrect, compte non confirmé, ou adresse non autorisée.";
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
  if (order.shipment.status === "label_ready") {
    if (order.shipment.labelEmailStatus === "sent") {
      return order.shipment.zone === "EU"
        ? "étiquette A4 prête · envoyée par e-mail"
        : "étiquette + douane A4 prêtes · envoyées par e-mail";
    }
    if (order.shipment.labelEmailStatus === "failed") {
      return "étiquette prête · e-mail à vérifier";
    }
    return "étiquette prête · e-mail en cours";
  }
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

function customsReadyForFulfillment(order: Order): boolean {
  return labelReadyForFulfillment(order) && order.shipment?.zone !== "EU" &&
    order.shipment?.customsStatus === "ready";
}

function invoiceAvailable(order: Order): boolean {
  return ["paid", "preparing", "shipped", "refunded"].includes(order.status);
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
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
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
  const [recipientPhones, setRecipientPhones] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const response = await fetch(`${ADMIN_API}/orders`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.status === 403) {
      setState({ kind: "unauthenticated", message: null });
      return;
    }
    if (!response.ok) {
      setState({ kind: "error", message: operatorMessage(await parseError(response)) });
      return;
    }
    const promotionsResponse = await fetch(`${ADMIN_API}/promotions`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!promotionsResponse.ok) {
      setState({ kind: "error", message: operatorMessage(await parseError(promotionsResponse)) });
      return;
    }
    const inventoryResponse = await fetch(`${ADMIN_API}/inventory`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!inventoryResponse.ok) {
      setState({ kind: "error", message: operatorMessage(await parseError(inventoryResponse)) });
      return;
    }
    const payload = await response.json() as { data: readonly Order[] };
    const promotionsPayload = await promotionsResponse.json() as { data: readonly Promotion[] };
    const inventoryPayload = await inventoryResponse.json() as { data: Inventory };
    const csrfToken = readCookie("__Host-aj_admin_csrf");
    if (!csrfToken) {
      setState({ kind: "error", message: "La session opérateur est incomplète. Aucune action n’est possible." });
      return;
    }
    setState({
      kind: "ready",
      orders: payload.data,
      promotions: promotionsPayload.data,
      inventory: inventoryPayload.data,
      csrfToken,
    });
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loginBusy) return;
    setLoginBusy(true);
    setState({ kind: "unauthenticated", message: null });
    try {
      const response = await fetch(`${ADMIN_API}/session`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      if (!response.ok) {
        setState({
          kind: "unauthenticated",
          message: operatorMessage(await parseError(response)),
        });
        return;
      }
      setLoginPassword("");
      await load();
    } catch {
      setState({
        kind: "unauthenticated",
        message: "Connexion momentanément indisponible. Aucune donnée n’a été modifiée.",
      });
    } finally {
      setLoginBusy(false);
    }
  }

  useEffect(() => {
    const task = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(task);
  }, [load]);

  async function downloadShippingDocument(
    order: Order,
    csrfToken: string,
    documentKind: "label" | "customs" = "label",
    recipientPhone?: string,
  ) {
    const retrying = Boolean(recipientPhone);
    if (documentKind === "customs" && !customsReadyForFulfillment(order)) return;
    if (documentKind === "label" &&
      (retrying ? !order.shipment?.retryAllowed : !labelReadyForFulfillment(order))) return;
    if (retrying && !window.confirm(
      `Créer une seule étiquette pour ${order.orderNumber} avec ce téléphone destinataire ? Cette action peut facturer l’affranchissement sélectionné par le client.`,
    )) return;
    setBusyOrder(order.orderId);
    setActionError(null);
    try {
      const response = await fetch(
        `${ADMIN_API}/orders/${encodeURIComponent(order.orderId)}/${
          documentKind === "label" ? "shipping-label" : "customs-document"
        }`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "X-CSRF-Token": csrfToken,
            "Idempotency-Key": `operator-${documentKind}:${order.orderId}`,
            "X-AJ-Download-Request-Id": `${documentKind}-download:${crypto.randomUUID()}`,
            ...(retrying ? { "Content-Type": "application/json" } : {}),
          },
          ...(retrying ? { body: JSON.stringify({ recipientPhone }) } : {}),
        },
      );
      if (!response.ok) throw new Error(await parseError(response));
      const blob = await response.blob();
      if (blob.type !== "application/pdf") throw new Error("SHIPPING_DOCUMENT_UNAVAILABLE");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const documentLabel = documentKind === "label" ? "ETIQUETTE" : "DOUANE";
      link.download = `AJL-${order.orderNumber}-${documentLabel}-A4.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      await load();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "SHIPPING_DOCUMENT_UNAVAILABLE";
      setActionError(code === "MANUAL_RECONCILIATION_REQUIRED"
        ? "Résultat transporteur à vérifier. Ne recliquez pas : aucune deuxième étiquette ne doit être créée."
        : code === "SHIPMENT_RETRY_ALREADY_USED"
          ? "La relance unique a déjà été consommée. Vérifiez le transporteur avant toute autre action."
          : documentKind === "customs"
            ? "Le document douanier n’a pas pu être récupéré. L’expédition existante n’a pas été modifiée."
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
        `${ADMIN_API}/orders/${encodeURIComponent(order.orderId)}`,
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
        `${ADMIN_API}/shipments/${encodeURIComponent(order.shipment.id)}/handover`,
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
      const response = await fetch(`${ADMIN_API}/promotions`, {
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
        `${ADMIN_API}/promotions/${encodeURIComponent(promotion.id)}/status`,
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
    await fetch(`${ADMIN_API}/session`, {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "X-CSRF-Token": state.csrfToken },
    }).catch(() => null);
    window.location.assign("/admin");
  }

  const orders = state.kind === "ready" ? state.orders : [];
  const promotions = state.kind === "ready" ? state.promotions : [];
  const inventory = state.kind === "ready" ? state.inventory : null;
  const actionableOrders = orders.filter((order) => ["paid", "preparing"].includes(order.status));

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>AJ LUXURY</span>
        <nav aria-label="Navigation opérateur" className={styles.nav}>
          <span aria-current="page">Administration</span>
          {state.kind === "ready"
            ? <button type="button" onClick={() => void signOut()}>Déconnexion</button>
            : null}
        </nav>
      </header>

      <section className={styles.content}>
        <h1>Administration AJ Luxury</h1>
        {state.kind === "unauthenticated" ? (
          <section className={styles.loginCard} aria-labelledby="admin-login-title">
            <p className={styles.loginEyebrow}>Accès réservé</p>
            <h2 id="admin-login-title">Se connecter</h2>
            <p>
              Utilisez votre compte AJ Luxury confirmé avec l’adresse administrateur autorisée.
              Aucune double authentification ni clé physique n’est demandée.
            </p>
            <form className={styles.loginForm} onSubmit={(event) => void login(event)}>
              <label>
                Adresse e-mail
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.currentTarget.value)}
                />
              </label>
              <label>
                Mot de passe
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.currentTarget.value)}
                />
              </label>
              <button type="submit" disabled={loginBusy}>
                {loginBusy ? "Connexion…" : "Ouvrir le tableau de bord"}
              </button>
            </form>
            {state.message ? <p className={styles.loginError} role="alert">{state.message}</p> : null}
            <p className={styles.loginHelp}>
              Première connexion ? <a href="/account?view=register&amp;returnTo=/admin">Créer et confirmer le compte</a>.
            </p>
          </section>
        ) : null}
        {state.kind === "ready" ? <p className={styles.summary}>
          {actionableOrders.length} commande(s) à préparer sur {orders.length} commande(s) suivie(s).<br />
          Pour chaque commande, l’étiquette A4 est envoyée automatiquement à jeremy@ajluxurystore.com. Hors UE, le document douanier A4 est joint au même e-mail.<br />
          Les mêmes documents restent téléchargeables ici, sans créer un deuxième colis. Vérifiez les articles, imprimez les documents requis, puis confirmez la remise physique au transporteur.
        </p> : null}

        {state.kind === "ready" ? <aside className={styles.documentGuide} aria-labelledby="document-guide-title">
          <h2 id="document-guide-title">Facturation et expédition&nbsp;: 2 usages distincts</h2>
          <dl>
            <div>
              <dt>Facture et avoirs A4</dt>
              <dd>
                Justificatifs comptables du client. La facture apparaît après paiement et,
                en cas de remboursement, l’avoir correspondant est ajouté automatiquement.
              </dd>
            </div>
            <div>
              <dt>Documents d’expédition A4</dt>
              <dd>
                L’étiquette transporteur est envoyée automatiquement par e-mail à Jérémy pour chaque commande.
                Pour une destination hors UE, le document douanier est joint au même e-mail. Les documents restent ici
                comme solution de secours : les retélécharger ne recrée jamais d’expédition. Ce n’est pas une facture.
              </dd>
            </div>
          </dl>
        </aside> : null}

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
              <span role="columnheader">E-mails client</span>
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
                      {invoiceAvailable(order) ? (
                        <a
                          className={styles.documentLink}
                          href={`${ADMIN_API}/orders/${encodeURIComponent(order.orderId)}/invoice`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Ouvrir la facture et les éventuels avoirs A4 de la commande ${order.orderNumber} dans un nouvel onglet`}
                        >
                          Ouvrir facture et avoirs A4
                        </a>
                      ) : null}
                      {labelReadyForFulfillment(order) ? (
                        <button
                          className={styles.download}
                          type="button"
                          disabled={busyOrder !== null || busyHandover !== null}
                          onClick={() => void downloadShippingDocument(order, state.csrfToken)}
                        >
                          {busyOrder === order.orderId ? "Récupération…" : "Télécharger l’étiquette transporteur A4"}
                        </button>
                      ) : null}
                      {customsReadyForFulfillment(order) ? (
                        <button
                          className={styles.download}
                          type="button"
                          disabled={busyOrder !== null || busyHandover !== null}
                          onClick={() => void downloadShippingDocument(
                            order,
                            state.csrfToken,
                            "customs",
                          )}
                        >
                          {busyOrder === order.orderId ? "Récupération…" : "Télécharger le document douanier A4"}
                        </button>
                      ) : null}
                      {order.shipment?.retryAllowed ? (
                        <span className={styles.labelRetry}>
                          <label htmlFor={`recipient-phone-${order.orderId}`}>
                            Téléphone du destinataire au format international
                          </label>
                          <input
                            id={`recipient-phone-${order.orderId}`}
                            autoComplete="tel"
                            inputMode="tel"
                            pattern="\+[1-9][0-9]{7,14}"
                            placeholder="ex. +33612345678"
                            value={recipientPhones[order.orderId] ?? ""}
                            onChange={(event) => setRecipientPhones((current) => ({
                              ...current,
                              [order.orderId]: event.currentTarget.value.replaceAll(" ", ""),
                            }))}
                          />
                          <button
                            className={styles.download}
                            type="button"
                            disabled={busyOrder !== null ||
                              !/^\+[1-9]\d{7,14}$/.test(recipientPhones[order.orderId] ?? "")}
                            onClick={() => void downloadShippingDocument(
                              order,
                              state.csrfToken,
                              "label",
                              recipientPhones[order.orderId],
                            )}
                          >
                            {busyOrder === order.orderId
                              ? "Création contrôlée…"
                              : "Créer puis télécharger l’étiquette A4"}
                          </button>
                          <small>Une seule relance est autorisée. En cas de doute transporteur, ne pas recliquer.</small>
                        </span>
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
          <section className={styles.inventory} aria-labelledby="inventory-title">
            <div className={styles.sectionHeading}>
              <div>
                <p>Disponibilité réelle</p>
                <h2 id="inventory-title">Stock</h2>
              </div>
              <span>{inventory?.totals.availableQuantity ?? 0} vendable(s)</span>
            </div>
            <div className={styles.inventoryTotals}>
              <div><span>Physique</span><strong>{inventory?.totals.physicalQuantity ?? 0}</strong></div>
              <div><span>Cadeaux</span><strong>{inventory?.totals.giftReserveQuantity ?? 0}</strong></div>
              <div><span>Réservé panier</span><strong>{inventory?.totals.activeReservedQuantity ?? 0}</strong></div>
              <div><span>Vendu</span><strong>{inventory?.totals.soldQuantity ?? 0}</strong></div>
              <div><span>Disponible</span><strong>{inventory?.totals.availableQuantity ?? 0}</strong></div>
            </div>
            <div className={styles.inventoryTable} role="table" aria-label="Stock par coloris et taille">
              <div className={styles.inventoryHeader} role="row">
                <span role="columnheader">Référence</span>
                <span role="columnheader">Coloris</span>
                <span role="columnheader">Taille</span>
                <span role="columnheader">Physique</span>
                <span role="columnheader">Vendu</span>
                <span role="columnheader">Disponible</span>
              </div>
              {inventory?.items.map((item) => (
                <div className={styles.inventoryRow} role="row" key={item.internalReference}>
                  <span role="cell" data-label="Référence">{item.internalReference}</span>
                  <span role="cell" data-label="Coloris">{item.colorName}</span>
                  <span role="cell" data-label="Taille">{item.size}</span>
                  <span role="cell" data-label="Physique">{item.physicalQuantity}</span>
                  <span role="cell" data-label="Vendu">{item.soldQuantity}</span>
                  <strong role="cell" data-label="Disponible">{item.availableQuantity}</strong>
                </div>
              ))}
            </div>
            <p className={styles.stockNote}>
              Le paiement confirmé décrémente automatiquement la variante achetée. Les quantités internes ne sont jamais publiées côté client.
            </p>
          </section>
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
