"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./operations.module.css";

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
  }> | null;
  emails: Readonly<{
    orderConfirmation: string | null;
    paymentConfirmation: string | null;
  }>;
}>;

type ConsoleState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; orders: readonly Order[]; csrfToken: string }>
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
  if (code === "FRESH_MFA_REQUIRED") {
    return "La preuve MFA n’est plus assez récente. Reconnectez-vous via Cloudflare Access.";
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
  if (!order.shipment) return "étiquette à créer";
  if (order.shipment.status === "label_ready") return "étiquette prête";
  if (["handed_over", "in_transit"].includes(order.shipment.status ?? "")) {
    return "remise transporteur confirmée";
  }
  if (order.shipment.status === "delivered") return "livrée";
  return "contrôle nécessaire";
}

function emailLabel(order: Order): string {
  const confirmed = [order.emails.orderConfirmation, order.emails.paymentConfirmation]
    .filter((value) => value === "sent" || value === "confirmed").length;
  return `${confirmed}/2 confirmés`;
}

function amount(order: Order): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: order.currency,
  }).format(order.totalCents / 100);
}

export default function OperatorConsole() {
  const [state, setState] = useState<ConsoleState>({ kind: "loading" });
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    const payload = await response.json() as { data: readonly Order[] };
    const csrfToken = readCookie("__Host-aj_admin_csrf");
    if (!csrfToken) {
      setState({ kind: "error", message: "La session opérateur est incomplète. Aucune action n’est possible." });
      return;
    }
    setState({ kind: "ready", orders: payload.data, csrfToken });
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(task);
  }, [load]);

  async function downloadLabel(order: Order, csrfToken: string) {
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
        <h1>Commandes à préparer</h1>
        <p className={styles.summary}>
          {orders.length} {orders.length > 1 ? "commandes payées nécessitent" : "commande payée nécessite"} une action de préparation.<br />
          Créez l’étiquette, remettez le colis au transporteur et attendez son premier scan.
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
          <div className={styles.table} role="table" aria-label="Commandes payées">
            <div className={styles.tableHeader} role="row">
              <span role="columnheader">Commande</span>
              <span role="columnheader">Paiement</span>
              <span role="columnheader">E-mails</span>
              <span role="columnheader">Livraison</span>
              <span role="columnheader">Montant</span>
              <span role="columnheader">Action</span>
            </div>
            {orders.map((order) => (
              <article className={styles.row} role="row" key={order.orderId}>
                <span className={styles.orderNumber} role="cell" data-label="Commande">{order.orderNumber}</span>
                <span role="cell" data-label="Paiement">réglé</span>
                <span role="cell" data-label="E-mails">{emailLabel(order)}</span>
                <span className={styles.delivery} role="cell" data-label="Livraison">{deliveryLabel(order)}</span>
                <span role="cell" data-label="Montant">{amount(order)}</span>
                <span role="cell" data-label="Action">
                  {!["handed_over", "in_transit", "delivered"].includes(order.shipment?.status ?? "") ? (
                    <button
                      className={styles.download}
                      type="button"
                      disabled={busyOrder !== null}
                      onClick={() => void downloadLabel(order, state.csrfToken)}
                    >
                      {busyOrder === order.orderId ? "Récupération…" : "Télécharger l’étiquette A4"}
                    </button>
                  ) : <span className={styles.complete}>terminée</span>}
                </span>
              </article>
            ))}
            {orders.length === 0 ? <p className={styles.empty}>Aucune commande payée à préparer.</p> : null}
          </div>
        ) : null}

        <p className={styles.reminder}>
          Un clic récupère toujours l’étiquette unique de la commande. Si le transporteur répond de façon ambiguë, la console bloque toute nouvelle création.
        </p>

        <dl className={styles.key}>
          <div><dt>étiquette à créer</dt><dd>action requise</dd></div>
          <div><dt>étiquette prête</dt><dd>prête à être remise</dd></div>
          <div><dt>remise transporteur confirmée</dt><dd>terminée</dd></div>
        </dl>
      </section>
    </main>
  );
}
