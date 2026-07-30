import StoreFooter from "./StoreFooter";
import StoreHeader from "./StoreHeader";
import styles from "./InfoPage.module.css";

type InfoPageProps = {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  status?: React.ReactNode | false;
};

export function InfoNotice({
  children,
  warning = false,
}: {
  children: React.ReactNode;
  warning?: boolean;
}) {
  return (
    <aside className={warning ? styles.warning : styles.notice}>{children}</aside>
  );
}

export function InfoTable({ children }: { children: React.ReactNode }) {
  return <div className={styles.tableWrap}>{children}</div>;
}

export default function InfoPage({
  eyebrow,
  title,
  children,
  status = "Contenu à valider avant mise en ligne",
}: InfoPageProps) {
  return (
    <main className={styles.page}>
      <StoreHeader />
      <section className={styles.main}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <div className={styles.copy}>
          {children}
          {status && <span className={styles.status}>{status}</span>}
        </div>
      </section>
      <StoreFooter />
    </main>
  );
}
