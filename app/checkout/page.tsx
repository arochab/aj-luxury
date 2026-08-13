import Link from "next/link";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";
import CheckoutClient from "./CheckoutClient";
import styles from "../cart/CommerceShell.module.css";

export const metadata = {
  title: "Livraison préproduction | AJ Luxury",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <main className={styles.shell}>
      <StoreHeader />
      <div className={styles.header} aria-label="Checkout">
        <Link href="/cart"><T id="checkout.backToCart" /></Link>
        <span />
        <span><T id="checkout.preprodLabel" /></span>
      </div>
      <aside className={styles.notice}>
        <T id="checkout.preprodNotice" />
      </aside>
      <CheckoutClient />
      <StoreFooter />
    </main>
  );
}
