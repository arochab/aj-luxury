import StoreFooter from "./StoreFooter";
import StoreHeader from "./StoreHeader";
import styles from "./InfoPage.module.css";

type InfoPageProps = {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
};

export default function InfoPage({
  eyebrow,
  title,
  children,
}: InfoPageProps) {
  return (
    <main className={styles.page}>
      <StoreHeader />
      <section className={styles.main}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <div className={styles.copy}>
          {children}
          <span className={styles.status}>
            Contenu à valider avant mise en ligne
          </span>
        </div>
      </section>
      <StoreFooter />
    </main>
  );
}
