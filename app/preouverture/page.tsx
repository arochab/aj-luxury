import type { Metadata } from "next";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import styles from "./Preouverture.module.css";

export const metadata: Metadata = {
  title: "Préouverture | AJ Luxury",
  description: "État de préparation privé avant l’ouverture d’AJ Luxury.",
  robots: { index: false, follow: false },
};

const construit = [
  "Façade AJ Luxury et parcours mobile",
  "3 coloris × 4 tailles",
  "Prix unité, duo et trio",
  "Packs reliés au stock des boxers",
  "Panier et parcours de paiement",
  "Livraison, e-mails et retours",
  "Pages légales et confidentialité",
];

const validations = [
  ["Stock", "726 pièces à vendre + 23 cadeaux restant réservés, ventilés par couleur × taille"],
  ["Composition", "94 % modal · 6 % élasthanne"],
  ["TVA", "Aucune TVA collectée · mention article 293 B sur facture"],
  ["Livraison", "France + UE : prix, délais, poids et formats des colis"],
  ["Validation finale", "Photos, textes et prix"],
];

const activation = [
  "Importer les 726 pièces vendables dans le stock de production",
  "Activer Stripe, Sendcloud et les e-mails sur le domaine public",
  "Passer puis rembourser une vraie commande avant l’ouverture",
];

export default function PreouverturePage() {
  return (
    <main className={styles.page}>
      <StoreHeader />

      <section className={styles.hero} aria-labelledby="preouverture-title">
        <p className={styles.eyebrow}>Préouverture privée · 25 août 2026</p>
        <h1 id="preouverture-title">Le site est construit.<br />L’ouverture tient à cinq validations.</h1>
        <div className={styles.metrics} aria-label="Chiffres clés">
          <p><strong>726</strong><span>pièces à vendre</span></p>
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
            <span className={`${styles.status} ${styles.waiting}`}>Jérémy</span>
            <h2>Les 5 validations attendues</h2>
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
            <span className={`${styles.status} ${styles.next}`}>Adam</span>
            <h2>Les 3 actions d’ouverture</h2>
          </header>
          <ol className={styles.actions}>
            {activation.map((item, index) => (
              <li key={item}><span>{index + 1}</span><p>{item}</p></li>
            ))}
          </ol>
          <p className={styles.gate}>Puis : contrôle du paiement, du stock, de l’e-mail, de l’expédition et du remboursement. Si tout passe, ouverture au public.</p>
        </article>
      </section>

      <section className={styles.closing}>
        <p>Jérémy valide cinq points.</p>
        <p>Adam réalise trois actions et une commande réelle.</p>
        <strong>Le public entre après le test réussi.</strong>
      </section>

      <StoreFooter />
    </main>
  );
}
