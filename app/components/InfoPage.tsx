import StoreFooter from "./StoreFooter";
import StoreHeader from "./StoreHeader";
import styles from "./InfoPage.module.css";
import LocalizedInfoContent from "./LocalizedInfoContent";
import { T } from "@/lib/i18n/TranslatedText";

type InfoPageProps = {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  status?: React.ReactNode | false;
  officialFrenchOnly?: boolean;
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
  status = <T id="info.defaultStatus" />,
  officialFrenchOnly = false,
}: InfoPageProps) {
  return (
    <main className={styles.page}>
      <StoreHeader />
      <section className={styles.main}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <div className={styles.copy}>
          <LocalizedInfoContent
            status={
              status ? <span className={styles.status}>{status}</span> : false
            }
            officialFrenchOnly={officialFrenchOnly}
          >
            {children}
          </LocalizedInfoContent>
        </div>
      </section>
      <StoreFooter />
    </main>
  );
}
