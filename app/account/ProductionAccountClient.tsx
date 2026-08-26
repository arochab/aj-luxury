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
  paid: "Paiement confirmé",
  preparing: "Commande en préparation",
  shipped: "Commande expédiée",
  cancelled: "Commande annulée",
  refunded: "Commande remboursée",
});

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
      }
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

  if (loading) {
    return <div className={`${styles.main} ${styles.accountMain}`} aria-busy="true"><p>Chargement de votre espace…</p></div>;
  }

  if (account) {
    return (
      <div className={`${styles.main} ${styles.accountMain}`} aria-busy={submitting}>
        <section aria-labelledby="account-title">
          <p className={styles.eyebrow}>Votre espace sécurisé</p>
          <h1 className={styles.title} id="account-title">Mon compte</h1>
          <div className={styles.accountProfile}>
            <p><strong>Adresse e-mail</strong><br />{account.email}</p>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={acceptsMarketing} disabled={submitting} onChange={(event) => void changeMarketing(event.currentTarget.checked)} />
              <span>Recevoir les nouveautés AJ Luxury. Facultatif et révocable à tout moment.</span>
            </label>
            <button className={styles.secondaryButton} type="button" disabled={submitting} onClick={() => void logout()}>Se déconnecter</button>
          </div>
          {message && <p className={styles.success} role="status">{message}</p>}
          {error && <div className={styles.error} role="alert"><p>{error}</p></div>}
        </section>

        <aside className={`${styles.summary} ${styles.accountOrderSummary}`} aria-label="Historique des commandes">
          <p className={styles.eyebrow}>Historique</p>
          <h2>{account.orders.length ? `${account.orders.length} commande${account.orders.length > 1 ? "s" : ""}` : "Aucune commande"}</h2>
          {account.orders.map((order) => (
            <article className={styles.accountOrder} key={order.orderNumber}>
              <strong>{order.orderNumber}</strong>
              <small>{orderStatusLabel[order.status]}</small>
              {order.lines.map((line, index) => (
                <div className={styles.row} key={`${order.orderNumber}-${line.colorName}-${line.size}-${index}`}>
                  <span>{line.colorName} · {line.size} × {line.quantity}</span>
                  <LocalizedPrice amountCents={line.lineTotalCents} />
                </div>
              ))}
              <div className={`${styles.row} ${styles.total}`}>
                <span>Total</span><LocalizedPrice amountCents={order.totalCents} />
              </div>
            </article>
          ))}
          {!account.orders.length && <Link className={styles.button} href="/shop">Découvrir la boutique</Link>}
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
