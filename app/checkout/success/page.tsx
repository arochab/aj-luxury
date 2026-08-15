import StoreFooter from "../../components/StoreFooter";
import StoreHeader from "../../components/StoreHeader";
import { getServerCommerceRuntimeMode } from "../../../lib/commerce/commerce-runtime.server";
import styles from "../../cart/CommerceShell.module.css";
import ProductionCheckoutSuccessClient from "./ProductionCheckoutSuccessClient";

export const metadata = {
  title: "Confirmation de paiement | AJ Luxury",
  robots: { index: false, follow: false },
};

export default function CheckoutSuccessPage() {
  const runtimeMode = getServerCommerceRuntimeMode();
  return (
    <main className={styles.shell}>
      <StoreHeader />
      {runtimeMode === "production" ? (
        <ProductionCheckoutSuccessClient />
      ) : (
        <div className={styles.main}>
          <section className={styles.empty}>
            <h1>Confirmation indisponible</h1>
            <p>Cette route de retour de paiement est réservée au commerce de production.</p>
          </section>
        </div>
      )}
      <StoreFooter />
    </main>
  );
}

