import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";
import styles from "../cart/CommerceShell.module.css";

export const metadata = {
  title: "Espace client simulé | AJ Luxury",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <main className={styles.shell}>
      <StoreHeader />
      <aside className={styles.notice}>
        <T id="account.demoNotice" />
      </aside>

      <div className={styles.main}>
        <section>
          <p className={styles.eyebrow}>
            <T id="account.eyebrow" />
          </p>
          <h1 className={styles.title}>
            <T id="account.welcome" />
          </h1>
          <form className={styles.form}>
            <label>
              <T id="account.email" />
              <input
                type="email"
                autoComplete="email"
              />
            </label>
            <label>
              <T id="account.password" />
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </label>
            <button className={styles.lockedButton} type="button" disabled>
              <T id="account.disabled" />
            </button>
          </form>
        </section>

        <aside className={styles.cards}>
          <article className={styles.card}>
            <span><T id="account.ordersLabel" /></span>
            <h2><T id="account.ordersTitle" /></h2>
            <p><T id="account.ordersBody" /></p>
          </article>
          <article className={styles.card}>
            <span><T id="account.profileLabel" /></span>
            <h2><T id="account.profileTitle" /></h2>
            <p><T id="account.profileBody" /></p>
          </article>
          <article className={styles.card}>
            <span><T id="account.securityLabel" /></span>
            <h2><T id="account.securityTitle" /></h2>
            <p><T id="account.securityBody" /></p>
          </article>
        </aside>
      </div>
      <StoreFooter />
    </main>
  );
}
