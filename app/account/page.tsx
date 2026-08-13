import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";
import styles from "../cart/CommerceShell.module.css";
import AccountClient from "./AccountClient";

export const metadata = {
  title: "Espace client de test | AJ Luxury",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <main className={styles.shell}>
      <StoreHeader />
      <aside className={styles.notice}>
        <T id="account.privateDemoNotice" />
      </aside>

      <AccountClient />
      <StoreFooter />
    </main>
  );
}
