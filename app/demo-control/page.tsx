import Link from "next/link";
import DemoPageFrame from "../components/demo/DemoPageFrame";
import styles from "../components/demo/DemoJourney.module.css";

export const metadata = {
  title: "Parcours client local | AJ Luxury",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const scenes = [
  ["01", "Panier", "Un article Apollon Pourpre Impérial en taille M.", "/cart"],
  ["02", "Livraison", "Scénarios France et Canada, avec information DAP.", "/checkout"],
  ["03", "Confirmation", "Commande fictive et total cohérent.", "/checkout/confirmation?destination=FR"],
  ["04", "Compte client", "Profil Alex Martin et historique de commande.", "/account"],
  ["05", "Suivi", "Chronologie et référence DHL Express simulées.", "/account/orders/AJ-DEMO-1042"],
  ["06", "Retour", "Demande de retour sans donnée persistée.", "/return"],
  ["07", "Remboursement", "Clôture illustrative de 29,99 €.", "/refund"],
] as const;

export default function DemoControlPage() {
  return (
    <DemoPageFrame step="Pilotage de la présentation">
      <div className={styles.controlPage}>
        <p className={styles.eyebrow}>Démo locale isolée · Parcours guidé</p>
        <h1>Le client, de l’achat au remboursement</h1>
        <p className={styles.controlIntro}>
          Chaque écran utilise les mêmes données fictives. Aucun compte, paiement, colis, e-mail ou remboursement réel n’existe derrière cette présentation.
        </p>

        <div className={styles.privateNotice}>
          <span className={styles.miniSimulation}>SIMULATION</span>
          <p>
            Démonstration isolée de la production, non indexable, sans cookie
            et sans service tiers. Le logo DHL officiel identifie uniquement un
            transporteur hypothétique : aucun partenariat, compte ni service
            DHL n’est connecté.
          </p>
        </div>

        <div className={styles.controlGrid}>
          {scenes.map(([index, title, description, href]) => (
            <article className={styles.controlCard} key={index}>
              <span className={styles.controlIndex}>{index}</span>
              <h2>{title}</h2>
              <p>{description}</p>
              <Link className={styles.textButton} href={href}>Ouvrir cet écran</Link>
            </article>
          ))}
        </div>
      </div>
    </DemoPageFrame>
  );
}
