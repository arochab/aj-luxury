import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";
import CartClient from "./CartClient";
import styles from "./CommerceShell.module.css";

export const metadata = {
  title: "Votre panier | AJ Luxury",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <main className={styles.shell}>
      <StoreHeader />
      <aside className={styles.notice}>
        <T id="cart.preprodNotice" />
      </aside>
      <CartClient />
      <StoreFooter />
    </main>
  );
}
