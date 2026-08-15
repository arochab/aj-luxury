import Link from "next/link";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";
import CheckoutClient from "./CheckoutClient";
import ProductionCheckoutClient from "./ProductionCheckoutClient";
import styles from "../cart/CommerceShell.module.css";
import { getServerCommerceRuntimeMode } from "../../lib/commerce/commerce-runtime.server";

export function generateMetadata() {
  const runtimeMode = getServerCommerceRuntimeMode();
  return {
    title: runtimeMode === "production"
      ? "Livraison et paiement | AJ Luxury"
      : runtimeMode === "preproduction"
        ? "Livraison préproduction | AJ Luxury"
        : "Commerce fermé | AJ Luxury",
    robots: { index: false, follow: false },
  };
}

export default function CheckoutPage() {
  const runtimeMode = getServerCommerceRuntimeMode();
  return (
    <main className={styles.shell}>
      <StoreHeader />
      <div className={styles.header} aria-label="Checkout">
        <Link href="/cart"><T id="checkout.backToCart" /></Link>
        <span />
        <span>
          {runtimeMode === "preproduction"
            ? <T id="checkout.preprodLabel" />
            : runtimeMode === "production"
              ? "Paiement sécurisé"
              : "Commerce fermé"}
        </span>
      </div>
      {runtimeMode === "preproduction" && (
        <aside className={styles.notice}>
          <T id="checkout.preprodNotice" />
        </aside>
      )}
      {runtimeMode === "preproduction" ? (
        <CheckoutClient />
      ) : runtimeMode === "production" ? (
        <ProductionCheckoutClient />
      ) : (
        <div className={styles.main}>
          <section className={styles.empty}>
            <h1>Commerce fermé</h1>
            <p>La vente en ligne n’est pas disponible dans cet environnement.</p>
          </section>
        </div>
      )}
      <StoreFooter />
    </main>
  );
}
