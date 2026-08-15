import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";
import CartClient from "./CartClient";
import styles from "./CommerceShell.module.css";
import { getServerCommerceRuntimeMode } from "../../lib/commerce/commerce-runtime.server";

export const metadata = {
  title: "Votre panier | AJ Luxury",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  const runtimeMode = getServerCommerceRuntimeMode();
  return (
    <main className={styles.shell}>
      <StoreHeader />
      {runtimeMode === "preproduction" && (
        <aside className={styles.notice}>
          <T id="cart.preprodNotice" />
        </aside>
      )}
      <CartClient runtimeMode={runtimeMode} />
      <StoreFooter />
    </main>
  );
}
