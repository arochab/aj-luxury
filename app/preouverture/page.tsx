import type { Metadata } from "next";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import styles from "./Preouverture.module.css";

export const metadata: Metadata = {
  title: "Contrôle d’ouverture | AJ Luxury",
  description: "État privé de la chaîne commerce AJ Luxury.",
  robots: { index: false, follow: false },
};

const construit = [
  "Façade AJ Luxury et parcours mobile",
  "3 coloris × 4 tailles",
  "Prix unité, duo et trio",
  "Packs reliés au stock des boxers",
  "Panier et parcours de paiement",
  "Livraison, e-mails et retours",
  "Factures, avoirs et étiquettes A4",
  "Tableau de bord administrateur et codes promotionnels",
  "Pages légales et confidentialité",
];

const validations = [
  ["Stock", "749 unités physiques, 23 cadeaux réservés et 724 disponibles après la première commande"],
  ["Composition", "94 % modal · 6 % élasthanne"],
  ["Facturation", "Facture après paiement, avoir après remboursement, TVA non applicable – art. 293 B du CGI"],
  ["Médiation", "Convention et coordonnées du médiateur publiées"],
  ["Recette", "Commande, paiement, stock, e-mails, retour et accès administrateur testés"],
];

const activation = [
  "Promouvoir le Worker, les migrations et les Assets sur le même SHA approuvé",
  "Vérifier le health public : mode live, commerce public et aucun blocker",
  "Exécuter le smoke test public sans dupliquer paiement, expédition ou remboursement",
];

export default function PreouverturePage() {
  return (
    <main className={styles.page}>
      <StoreHeader />

      <section className={styles.hero} aria-labelledby="preouverture-title">
        <p className={styles.eyebrow}>Contrôle privé · 1er septembre 2026</p>
        <h1 id="preouverture-title">La chaîne est validée.<br />La promotion doit conserver un seul SHA.</h1>
        <div className={styles.metrics} aria-label="Chiffres clés">
          <p><strong>724</strong><span>pièces disponibles après la première commande</span></p>
          <p><strong>3 × 4</strong><span>coloris × tailles</span></p>
          <p><strong>1 · 2 · 3</strong><span>unité · duo · trio</span></p>
        </div>
      </section>

      <section className={styles.board} aria-label="État de préparation">
        <article className={styles.column}>
          <header>
            <span className={`${styles.status} ${styles.done}`}>Terminé</span>
            <h2>Ce qui est construit</h2>
          </header>
          <ul>
            {construit.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>

        <article className={styles.column}>
          <header>
            <span className={`${styles.status} ${styles.done}`}>Validé</span>
            <h2>Les 5 preuves métier</h2>
          </header>
          <ol className={styles.decisions}>
            {validations.map(([title, detail], index) => (
              <li key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{title}</strong><p>{detail}</p></div>
              </li>
            ))}
          </ol>
        </article>

        <article className={styles.column}>
          <header>
            <span className={`${styles.status} ${styles.next}`}>Release</span>
            <h2>Les 3 contrôles de promotion</h2>
          </header>
          <ol className={styles.actions}>
            {activation.map((item, index) => (
              <li key={item}><span>{index + 1}</span><p>{item}</p></li>
            ))}
          </ol>
          <p className={styles.gate}>Aucun gate métier ou juridique restant. Si le runtime exact est vert, l’ouverture publique est autorisée.</p>
        </article>
      </section>

      <section className={styles.closing}>
        <p>Les validations métier et juridiques sont tracées.</p>
        <p>Le déploiement reste lié au SHA exact approuvé.</p>
        <strong>Le public entre uniquement sur un health check intégralement vert.</strong>
      </section>

      <StoreFooter />
    </main>
  );
}
