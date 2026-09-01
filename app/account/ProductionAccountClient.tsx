"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CustomerAccountApiError,
  getCustomerAccount,
  loginCustomerAccount,
  logoutCustomerAccount,
  registerCustomerAccount,
  requestCustomerPasswordReset,
  resetCustomerPassword,
  updateCustomerMarketing,
  type PublicCustomerAccount,
} from "../../lib/commerce/customer-account-client.ts";
import LocalizedPrice from "../components/LocalizedPrice";
import styles from "../cart/CommerceShell.module.css";

type View = "login" | "register" | "forgot" | "reset";

const orderStatusLabel = Object.freeze({
  pending_payment: "Paiement en attente",
  paid: "Paiement réglé",
  preparing: "Commande en préparation",
  shipped: "Commande expédiée",
  cancelled: "Commande annulée",
  refunded: "Commande remboursée",
});

const orderStatusDetail = Object.freeze({
  pending_payment: "Votre sélection est réservée dans l’attente du paiement.",
  paid: "Le paiement est confirmé. Votre colis est transmis à la préparation.",
  preparing: "Votre commande est en cours de préparation.",
  shipped: "Votre commande a été remise au transporteur.",
  cancelled: "Cette commande n’est plus active et aucun paiement n’est attendu.",
  refunded: "Le remboursement de cette commande a été enregistré.",
});

const progressStatuses = Object.freeze(["Paiement", "Préparation", "Expédition"]);

const invoiceStatuses = Object.freeze(["paid", "preparing", "shipped", "refunded"]);

function invoiceAvailable(
  status: PublicCustomerAccount["orders"][number]["status"],
): boolean {
  return invoiceStatuses.includes(status);
}

function orderProgress(status: PublicCustomerAccount["orders"][number]["status"]): number {
  if (status === "shipped") return 3;
  if (status === "preparing") return 2;
  if (status === "paid") return 1;
  return 0;
}

function formatOrderDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function itemCount(order: PublicCustomerAccount["orders"][number]): number {
  return order.lines.reduce((total, line) => total + line.quantity, 0);
}

function errorMessage(error: unknown): string {
  if (error instanceof CustomerAccountApiError && error.code === "INVALID_CREDENTIALS") {
    return "Adresse e-mail ou mot de passe incorrect.";
  }
  if (error instanceof CustomerAccountApiError && error.code === "INVALID_TOKEN") {
    return "Ce lien n’est plus valide. Demandez un nouveau lien.";
  }
  if (error instanceof CustomerAccountApiError && error.code === "INVALID_ACCOUNT_INPUT") {
    return "Vérifiez l’adresse e-mail et choisissez un mot de passe d’au moins 12 caractères.";
  }
  return "Le service est momentanément indisponible. Réessayez dans un instant.";
}

export default function ProductionAccountClient() {
  const [account, setAccount] = useState<PublicCustomerAccount | null>(null);
  const [view, setView] = useState<View>("login");
  const [resetToken, setResetToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acceptsMarketing, setAcceptsMarketing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await getCustomerAccount();
      setAccount(current);
      if (current) setAcceptsMarketing(current.acceptsMarketing);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("reset");
      if (token) {
        setResetToken(token);
        setView("reset");
      } else {
        const requestedView = params.get("view");
        if (requestedView === "login" || requestedView === "register" || requestedView === "forgot") {
          setView(requestedView);
        }
      }
      const requestedEmail = params.get("email");
      if (requestedEmail) setEmail(requestedEmail);
      if (params.get("verification") === "confirmed") {
        setMessage("Adresse e-mail confirmée. Votre compte est actif.");
      } else if (params.get("verification") === "invalid") {
        setError("Ce lien de vérification n’est plus valide.");
      }
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  function prepare(next: View) {
    setView(next);
    setMessage(null);
    setError(null);
    setPassword("");
    setConfirmation("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      if (view === "login") {
        await loginCustomerAccount(email, password);
        const returnTo = new URLSearchParams(window.location.search).get("returnTo");
        if (returnTo === "/checkout") {
          window.location.assign(returnTo);
          return;
        }
        await load();
      } else if (view === "register") {
        if (password !== confirmation) {
          setError("Les deux mots de passe ne correspondent pas.");
          return;
        }
        await registerCustomerAccount({
          email, password, acceptsMarketing, source: "account_registration",
        });
        setMessage("Compte enregistré. Ouvrez l’e-mail AJ Luxury pour confirmer votre adresse.");
      } else if (view === "forgot") {
        await requestCustomerPasswordReset(email);
        setMessage("Si cette adresse correspond à un compte, un lien vient d’être envoyé.");
      } else {
        if (password !== confirmation) {
          setError("Les deux mots de passe ne correspondent pas.");
          return;
        }
        await resetCustomerPassword(resetToken, password);
        setMessage("Mot de passe modifié.");
        window.history.replaceState({}, "", "/account");
        await load();
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    setSubmitting(true);
    setError(null);
    try {
      await logoutCustomerAccount();
      setAccount(null);
      prepare("login");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  async function changeMarketing(next: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      await updateCustomerMarketing(next);
      setAcceptsMarketing(next);
      setAccount((current) => current ? { ...current, acceptsMarketing: next } : current);
      setMessage(next ? "Préférence marketing enregistrée." : "Préférence marketing retirée.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  async function requestPasswordChange() {
    if (!account || submitting) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await requestCustomerPasswordReset(account.email);
      setMessage("Un lien sécurisé pour modifier votre mot de passe vient d’être envoyé.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className={`${styles.main} ${styles.accountMain}`} aria-busy="true"><p>Chargement sécurisé de votre espace…</p></div>;
  }

  if (account) {
    return (
      <div className={`${styles.main} ${styles.accountMain}`} aria-busy={submitting}>
        <section aria-labelledby="account-title">
          <p className={styles.eyebrow}>Votre espace sécurisé</p>
          <h1 className={styles.title} id="account-title">Mon compte</h1>
          <p className={styles.accountIntro}>Retrouvez vos commandes et gérez vos préférences depuis un seul espace.</p>

          <dl className={styles.accountOverview}>
            <div><dt>Compte</dt><dd>Actif et vérifié</dd></div>
            <div><dt>Commandes</dt><dd>{account.orders.length}</dd></div>
            <div><dt>Adresse e-mail</dt><dd>{account.email}</dd></div>
          </dl>

          <div className={styles.accountSectionHeading}>
            <div>
              <p className={styles.eyebrow}>Historique</p>
              <h2>Mes commandes</h2>
            </div>
            <Link className={styles.accountTextLink} href="/shop">Continuer mes achats</Link>
          </div>

          <aside className={styles.accountBillingNotice} aria-labelledby="account-billing-title">
            <div>
              <p className={styles.eyebrow}>Facturation</p>
              <h3 id="account-billing-title">Facture et avoirs, au même endroit que votre commande</h3>
            </div>
            <p>
              Dès que le paiement est confirmé, ouvrez vos documents de facturation A4 pour les
              imprimer ou les enregistrer en PDF. En cas de remboursement, l’avoir correspondant
              y apparaît automatiquement.
            </p>
          </aside>

          <div className={styles.accountOrders}>
            {account.orders.map((order) => {
              const progress = orderProgress(order.status);
              return (
                <article className={styles.accountOrder} key={order.orderNumber}>
                  <header className={styles.accountOrderHeader}>
                    <div>
                      <small>Commande du {formatOrderDate(order.createdAt)}</small>
                      <strong className={styles.orderNumber}>{order.orderNumber}</strong>
                    </div>
                    <span className={styles.accountStatus}>{orderStatusLabel[order.status]}</span>
                  </header>

                  <p className={styles.accountStatusDetail}>{orderStatusDetail[order.status]}</p>

                  {progress > 0 && (
                    <ol className={styles.accountProgress} aria-label="Avancement de la commande">
                      {progressStatuses.map((label, index) => (
                        <li className={index < progress ? styles.accountProgressDone : ""} key={label}>
                          <span aria-hidden="true" />{label}
                        </li>
                      ))}
                    </ol>
                  )}

                  <div className={styles.accountOrderLines}>
                    {order.lines.map((line, index) => (
                      <div className={styles.row} key={`${order.orderNumber}-${line.colorName}-${line.size}-${index}`}>
                        <span>{line.productName}<small>{line.colorName} · Taille {line.size} × {line.quantity}</small></span>
                        <LocalizedPrice amountCents={line.lineTotalCents} />
                      </div>
                    ))}
                  </div>

                  <footer className={styles.accountOrderFooter}>
                    <span>{itemCount(order)} article{itemCount(order) > 1 ? "s" : ""}</span>
                    <strong>Total&nbsp;: <LocalizedPrice amountCents={order.totalCents} /></strong>
                  </footer>
                  {invoiceAvailable(order.status) ? (
                    <div className={styles.accountOrderDocuments}>
                      <span>Document comptable</span>
                      <a
                        className={styles.accountInvoiceLink}
                        href={`/api/commerce/account/invoices/${encodeURIComponent(order.orderNumber)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Ouvrir la facture et les éventuels avoirs A4 de la commande ${order.orderNumber} dans un nouvel onglet`}
                      >
                        Ouvrir facture et avoirs A4
                      </a>
                    </div>
                  ) : order.status === "pending_payment" ? (
                    <p className={styles.accountInvoicePending}>
                      Aucun document de facturation tant que le paiement n’est pas confirmé. La facture apparaîtra ici dès sa confirmation.
                    </p>
                  ) : null}
                  {order.status === "cancelled" && <Link className={styles.accountTextLink} href="/shop">Passer une nouvelle commande</Link>}
                </article>
              );
            })}
            {!account.orders.length && (
              <div className={styles.accountEmptyOrders}>
                <h2>Votre première commande apparaîtra ici.</h2>
                <p>Vous pourrez retrouver son détail et son avancement depuis cet espace.</p>
                <Link className={styles.button} href="/shop">Découvrir la boutique</Link>
              </div>
            )}
          </div>

          {message && <p className={styles.success} role="status">{message}</p>}
          {error && <div className={styles.error} role="alert"><p>{error}</p></div>}
        </section>

        <aside className={`${styles.summary} ${styles.accountProfile}`} aria-label="Informations du compte">
          <section>
            <p className={styles.eyebrow}>Mes informations</p>
            <h2>Profil</h2>
            <p><strong>Adresse e-mail</strong><br />{account.email}</p>
            <p className={styles.accountVerified}>Adresse confirmée</p>
          </section>

          <section>
            <p className={styles.eyebrow}>Préférences</p>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={acceptsMarketing} disabled={submitting} onChange={(event) => void changeMarketing(event.currentTarget.checked)} />
              <span>Recevoir les nouveautés AJ Luxury. Facultatif et révocable à tout moment.</span>
            </label>
          </section>

          <section>
            <p className={styles.eyebrow}>Sécurité</p>
            <button className={styles.secondaryButton} type="button" disabled={submitting} onClick={() => void requestPasswordChange()}>Modifier mon mot de passe</button>
          </section>

          <section>
            <p className={styles.eyebrow}>Besoin d’aide&nbsp;?</p>
            <a className={styles.accountTextLink} href="mailto:contact@ajluxurystore.com">Contacter AJ Luxury</a>
          </section>

          <button className={styles.secondaryButton} type="button" disabled={submitting} onClick={() => void logout()}>Se déconnecter</button>
        </aside>
      </div>
    );
  }

  return (
    <div className={`${styles.main} ${styles.accountMain}`} aria-busy={submitting}>
      <section aria-labelledby="account-title">
        <p className={styles.eyebrow}>Votre espace sécurisé</p>
        <h1 className={styles.title} id="account-title">
          {view === "register" ? "Créer un compte" : view === "forgot" ? "Mot de passe oublié" : view === "reset" ? "Nouveau mot de passe" : "Se connecter"}
        </h1>
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          {view !== "reset" && <label>Adresse e-mail<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} /></label>}
          {view !== "forgot" && <label>Mot de passe<input type="password" required minLength={12} maxLength={128} autoComplete={view === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.currentTarget.value)} /></label>}
          {(view === "register" || view === "reset") && <label>Confirmer le mot de passe<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.currentTarget.value)} /></label>}
          {view === "register" && <label className={styles.checkbox}><input type="checkbox" checked={acceptsMarketing} onChange={(event) => setAcceptsMarketing(event.currentTarget.checked)} /><span>Je souhaite recevoir les nouveautés AJ Luxury. Cette option est facultative.</span></label>}
          <button className={styles.button} type="submit" disabled={submitting}>{submitting ? "Veuillez patienter…" : view === "register" ? "Créer mon compte" : view === "forgot" ? "Recevoir le lien" : view === "reset" ? "Enregistrer" : "Se connecter"}</button>
        </form>
        {message && <p className={styles.success} role="status">{message}</p>}
        {error && <div className={styles.error} role="alert"><p>{error}</p></div>}
      </section>

      <aside className={styles.summary} aria-label="Autres options">
        <p className={styles.eyebrow}>Accès client</p>
        {view !== "register" && <button className={styles.secondaryButton} type="button" onClick={() => prepare("register")}>Créer un compte</button>}
        {view !== "login" && <button className={styles.secondaryButton} type="button" onClick={() => prepare("login")}>J’ai déjà un compte</button>}
        {view !== "forgot" && view !== "reset" && <button className={styles.secondaryButton} type="button" onClick={() => prepare("forgot")}>Mot de passe oublié</button>}
        <p className={styles.muted}>Le compte peut aussi être créé pendant votre commande. Votre paiement reste sécurisé par Stripe.</p>
      </aside>
    </div>
  );
}
