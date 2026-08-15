import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";
import styles from "../cart/CommerceShell.module.css";
import AccountClient from "./AccountClient";
import ProductionAccountClient from "./ProductionAccountClient";
import { getServerCommerceRuntimeMode } from "../../lib/commerce/commerce-runtime.server";

export function generateMetadata() {
  const runtimeMode = getServerCommerceRuntimeMode();
  return {
    title: runtimeMode === "production"
      ? "Votre commande | AJ Luxury"
      : runtimeMode === "preproduction"
        ? "Espace client de test | AJ Luxury"
        : "Espace client fermé | AJ Luxury",
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default function AccountPage() {
  const runtimeMode = getServerCommerceRuntimeMode();
  return (
    <main className={styles.shell}>
      <StoreHeader />
      {runtimeMode === "preproduction" && (
        <aside className={styles.notice}>
          <T id="account.privateDemoNotice" />
        </aside>
      )}

      {runtimeMode === "preproduction" ? (
        <AccountClient />
      ) : runtimeMode === "production" ? (
        <ProductionAccountClient />
      ) : (
        <div className={styles.main}>
          <section className={styles.empty}>
            <h1>Espace client fermé</h1>
            <p>Le commerce n’est pas disponible dans cet environnement.</p>
          </section>
        </div>
      )}
      <StoreFooter />
    </main>
  );
}
