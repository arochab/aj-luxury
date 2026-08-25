"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceSyntheticDelivery,
  getOwnerAccount,
  getPreprodDiagnostics,
  type PublicOwnerAccount,
} from "../../lib/commerce/preprod-owner-account-client";
import { useI18n } from "../../lib/i18n/I18nProvider";
import LocalizedPrice from "../components/LocalizedPrice";
import styles from "../cart/CommerceShell.module.css";

const deliveryStages = [
  "paid",
  "label_ready",
  "handed_over",
  "in_transit",
  "delivered",
] as const;

const stageKeys = {
  paid: "account.stagePaid",
  label_ready: "account.stageLabelReady",
  handed_over: "account.stageHandedOver",
  in_transit: "account.stageInTransit",
  delivered: "account.stageDelivered",
} as const;

export default function AccountClient() {
  const { t } = useI18n();
  const [account, setAccount] = useState<PublicOwnerAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    setReady(false);
    try {
      const [nextAccount] = await Promise.all([
        getOwnerAccount(),
        getPreprodDiagnostics(),
      ]);
      setAccount(nextAccount);
      setReady(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const updateId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(updateId);
  }, [load]);

  async function advance() {
    if (advancing) return;
    setAdvancing(true);
    setFailed(false);
    try {
      setAccount(await advanceSyntheticDelivery());
      statusRef.current?.focus({ preventScroll: true });
    } catch {
      setFailed(true);
    } finally {
      setAdvancing(false);
    }
  }

  function printPreparationSheet() {
    window.print();
  }

  const order = account?.orders[0] ?? null;
  const currentStage = order?.delivery.stage ?? "paid";
  const currentIndex = deliveryStages.indexOf(currentStage);

  return (
    <div
      className={`${styles.main} ${styles.accountMain}`}
      aria-busy={loading || advancing}
    >
      <section aria-labelledby="account-title">
        <p className={styles.eyebrow}>{t("account.eyebrow")}</p>
        <h1 className={styles.title} id="account-title">
          {t("account.welcome")}
        </h1>

        {loading && <p className={styles.muted}>{t("account.loading")}</p>}
        {failed && (
          <div className={styles.error} role="alert">
            <p>{t("account.error")}</p>
            <button type="button" onClick={() => void load()}>
              {t("cart.retry")}
            </button>
          </div>
        )}
        {!loading && account && (
          <div className={styles.cards}>
            <article className={styles.card}>
              <span>{t("account.accessLabel")}</span>
              <h2>{t("account.passwordlessTitle")}</h2>
              <p>{account.email}</p>
              <p>{t("account.noEmailSent")}</p>
              {ready && (
                <p className={styles.demoReady} role="status">
                  {t("account.preprodReady")}
                </p>
              )}
            </article>
            {!order && (
              <article className={styles.card}>
                <span>{t("account.ordersLabel")}</span>
                <h2>{t("account.noOrdersTitle")}</h2>
                <p>{t("account.noOrdersBody")}</p>
              </article>
            )}
          </div>
        )}
      </section>

      {order && (
        <aside
          className={`${styles.summary} ${styles.accountOrderSummary}`}
          aria-label={t("account.latestOrder")}
        >
          <p className={styles.eyebrow}>{t("account.latestOrder")}</p>
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

          <div
            className={styles.deliveryStatus}
            aria-live="polite"
            tabIndex={-1}
            ref={statusRef}
          >
            <strong>{t("account.simulatedDelivery")}</strong>
            <ol className={styles.timeline}>
              {deliveryStages.map((stage, index) => (
                <li
                  className={index <= currentIndex ? styles.stageComplete : undefined}
                  key={stage}
                  aria-current={stage === currentStage ? "step" : undefined}
                >
                  {t(stageKeys[stage])}
                </li>
              ))}
            </ol>
            <p>{t("account.noCarrierNoParcel")}</p>
            <p><strong>{t("account.deliveryMethod")}</strong> {order.delivery.method}</p>
            {order.delivery.trackingReference && (
              <p>{t("account.simulatedReference")} {order.delivery.trackingReference}</p>
            )}
          </div>

          <section className={styles.preparationSheet} aria-labelledby="preparation-title">
            <h3 id="preparation-title">{t("account.preparationTitle")}</h3>
            <p>{t("account.preparationWarning")}</p>
            <p><strong>{t("account.latestOrder")}</strong> {order.orderNumber}</p>
            <p><strong>{t("account.deliveryMethod")}</strong> {order.delivery.method}</p>
            <ul className={styles.preparationLines}>
              {order.lines.map((line, index) => (
                <li key={`${line.productName}-${line.colorName}-${line.size}-${index}`}>
                  {line.productName} · {line.colorName} · {line.size} × {line.quantity}
                </li>
              ))}
            </ul>
            <ol>
              <li>{t("account.preparationPack")}</li>
              <li>{t("account.preparationLabelClosed")}</li>
              <li>{t("account.preparationDropoff")}</li>
              <li>{t("account.preparationTracking")}</li>
            </ol>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={printPreparationSheet}
            >
              {t("account.printPreparation")}
            </button>
          </section>

          {order.status === "paid" && order.delivery.stage !== "delivered" && (
            <button
              className={styles.button}
              type="button"
              disabled={advancing}
              onClick={() => void advance()}
            >
              {advancing ? t("account.advancing") : t("account.advanceSimulation")}
            </button>
          )}
        </aside>
      )}
    </div>
  );
}
