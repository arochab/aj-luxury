import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import styles from "../cart/CommerceShell.module.css";

export const metadata = {
  title: "Espace client simulé | AJ Luxury",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <main className={styles.shell}>
      <StoreHeader variant="minimal" />
      <aside className={styles.notice}>
        Espace client conceptuel · authentification non activée
      </aside>

      <div className={styles.main}>
        <section>
          <p className={styles.eyebrow}>Votre espace · Démonstration</p>
          <h1 className={styles.title}>Bienvenue.</h1>
          <form className={styles.form}>
            <label>
              Adresse email
              <input
                type="email"
                autoComplete="email"
                placeholder="vous@exemple.fr"
              />
            </label>
            <label>
              Mot de passe
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </label>
            <button className={styles.lockedButton} type="button" disabled>
              Connexion désactivée dans la maquette
            </button>
          </form>
        </section>

        <aside className={styles.cards}>
          <article className={styles.card}>
            <span>01 · Commandes</span>
            <h2>Suivre sans friction.</h2>
            <p>
              Historique, statut d’expédition et accès aux demandes de retour
              pourront être réunis ici.
            </p>
          </article>
          <article className={styles.card}>
            <span>02 · Profil</span>
            <h2>Vos préférences.</h2>
            <p>
              Coordonnées, adresses et consentements resteront modifiables par
              le client.
            </p>
          </article>
          <article className={styles.card}>
            <span>03 · Sécurité</span>
            <h2>Accès à définir.</h2>
            <p>
              Le mode d’authentification sera choisi avec la plateforme
              e-commerce, avant toute collecte de données.
            </p>
          </article>
        </aside>
      </div>
      <StoreFooter />
    </main>
  );
}
