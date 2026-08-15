"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getCurrentProductionOrder,
  type PublicProductionOrder,
} from "../../lib/commerce/production-order-client";
import { useI18n } from "../../lib/i18n/I18nProvider";
import LocalizedPrice from "../components/LocalizedPrice";
import styles from "../cart/CommerceShell.module.css";

/**
 * Cart-session order view. Customer identity/passwordless access remains a
 * separate release gate; this component never reuses owner-only preprod APIs.
 */
export default function ProductionAccountClient() {
  const { t } = useI18n();
  const [order, setOrder] = useState<PublicProductionOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setOrder(await getCurrentProductionOrder());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  return (
    <div className={`${styles.main} ${styles.accountMain}`} aria-busy={loading}>
      <section aria-labelledby="account-title">
        <p className={styles.eyebrow}>Votre espace</p>
        <h1 className={styles.title} id="account-title">Votre commande</h1>
        {loading && <p className={styles.muted}>{t("account.loading")}</p>}
        {failed && (
          <div className={styles.error} role="alert">
            <p>Votre commande ne peut pas être chargée pour le moment.</p>
            <button type="button" onClick={() => void load()}>{t("cart.retry")}</button>
          </div>
        )}
        {!loading && !failed && !order && (
          <div className={styles.cards}>
            <article className={styles.card}>
              <span>{t("account.ordersLabel")}</span>
              <h2>Aucune commande</h2>
              <p>Aucune commande n’est associée à cette session sécurisée.</p>
            </article>
          </div>
        )}
      </section>

      {order && (
        <aside className={`${styles.summary} ${styles.accountOrderSummary}`} aria-label="Dernière commande">
          <p className={styles.eyebrow}>Dernière commande</p>
          <h2 className={styles.orderNumber}>{order.orderNumber}</h2>
          {order.lines.map((line, index) => (
            <div className={styles.row} key={`${line.colorName}-${line.size}-${index}`}>
              <span>{line.colorName} · {line.size} × {line.quantity}</span>
              <LocalizedPrice amountCents={line.lineTotalCents} />
            </div>
          ))}
          <div className={`${styles.row} ${styles.total}`}>
            <span>{t("checkout.provisionalTotal")}</span>
            <LocalizedPrice amountCents={order.totalCents} />
          </div>
          <p className={styles.muted}>
            {order.status === "paid"
              ? "Paiement confirmé. Le suivi sera communiqué après remise au transporteur."
              : "Paiement en attente. Reprenez le paiement depuis la commande."}
          </p>
        </aside>
      )}
    </div>
  );
}
