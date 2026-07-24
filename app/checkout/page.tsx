import Link from "next/link";
import { createDemoCart } from "../../lib/commerce";
import StoreHeader from "../components/StoreHeader";
import styles from "../cart/CommerceShell.module.css";

export const metadata = {
  title: "Checkout simulé | AJ Luxury",
  robots: { index: false, follow: false },
};

type CheckoutPageProps = {
  searchParams: Promise<{ variant?: string }>;
};

export default async function CheckoutPage({
  searchParams,
}: CheckoutPageProps) {
  const { variant } = await searchParams;
  const cart = await createDemoCart(variant);

  return (
    <main className={styles.shell}>
      <StoreHeader variant="minimal" />
      <div className={styles.header} aria-label="Navigation du paiement">
        <Link
          href={
            variant
              ? `/cart?variant=${encodeURIComponent(variant)}`
              : "/cart"
          }
        >
          Retour au panier
        </Link>
        <span />
        <span>Checkout · Démo</span>
      </div>
      <aside className={styles.notice}>
        Simulation uniquement · aucun paiement, stockage ou envoi de données
      </aside>

      <div className={styles.main}>
        <section>
          <p className={styles.eyebrow}>Étape 1 sur 2 · Démonstration</p>
          <h1 className={styles.title}>Livraison.</h1>
          <form className={styles.form}>
            <label>
              Adresse email
              <input
                type="email"
                autoComplete="email"
                placeholder="vous@exemple.fr"
              />
            </label>
            <div className={styles.formGrid}>
              <label>
                Prénom
                <input autoComplete="given-name" placeholder="Prénom" />
              </label>
              <label>
                Nom
                <input autoComplete="family-name" placeholder="Nom" />
              </label>
            </div>
            <label>
              Adresse
              <input autoComplete="street-address" placeholder="Adresse" />
            </label>
            <div className={styles.formGrid}>
              <label>
                Code postal
                <input autoComplete="postal-code" placeholder="75000" />
              </label>
              <label>
                Ville
                <input autoComplete="address-level2" placeholder="Paris" />
              </label>
            </div>
            <button className={styles.lockedButton} type="button" disabled>
              Paiement désactivé dans la maquette
            </button>
          </form>
        </section>

        <aside className={styles.summary}>
          <p className={styles.eyebrow}>Votre sélection</p>
          {cart.lines.map((line) => (
            <div className={styles.row} key={line.id}>
              <span>
                {line.variant.productName}
                <br />
                {line.variant.color.name} · {line.variant.size}
              </span>
              <span>Prix à confirmer</span>
            </div>
          ))}
          <div className={`${styles.row} ${styles.total}`}>
            <span>Total provisoire</span>
            <span>À confirmer</span>
          </div>
          <p className={styles.muted}>
            Le futur prestataire de paiement créera une session sécurisée côté
            serveur. Aucun numéro de carte ne transitera par AJ Luxury.
          </p>
        </aside>
      </div>
    </main>
  );
}
