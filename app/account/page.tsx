import Link from "next/link";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";
import commerce from "../cart/CommerceShell.module.css";
import styles from "../components/Recit.module.css";
import AccountClient from "./AccountClient";
import ProductionAccountClient from "./ProductionAccountClient";
import { getServerCommerceRuntimeMode } from "../../lib/commerce/commerce-runtime.server";

/* ==========================================================================
   /account — sobre, utile, à la même finition que le reste
   --------------------------------------------------------------------------
   Cette page n'a rien à raconter : elle a un service à rendre. Elle reste
   donc immobile, sans GSAP, et sur le papier clair des pages utilitaires.
   Ce qu'elle emprunte au socle, c'est l'échelle : l'alphabet typographique,
   la gouttière, le filet de survol des liens, le plancher de 15px.

   Ce qui n'a PAS bougé, et pourquoi :
     • `generateMetadata`, `dynamic = "force-dynamic"` et robots noindex : la
       page dépend du mode d'exécution du commerce, elle ne peut pas être
       figée ni indexée ;
     • les trois branches de runtimeMode, à l'identique ;
     • la classe `.shell` de CommerceShell sur le <main>, et AccountClient /
       ProductionAccountClient comme enfants DIRECTS de ce <main>. La feuille
       d'impression de CommerceShell est bâtie sur
       « .shell > :not(.accountMain) » : elle masque tout sauf la fiche de
       préparation d'une commande. Retirer .shell, ou intercaler un
       conteneur, casserait l'impression. On ajoute donc `.compte` à côté,
       sans rien remplacer.

   La seule vue entièrement redessinée est « commerce fermé » — la seule que
   cet agent possède de bout en bout, et celle que sert l'environnement
   d'aperçu.
   ========================================================================== */

export function generateMetadata() {
  const runtimeMode = getServerCommerceRuntimeMode();
  return {
    title: runtimeMode === "production"
      ? "Mon compte | AJ Luxury"
      : runtimeMode === "preproduction"
        ? "Espace client de test | AJ Luxury"
        : "Espace client fermé | AJ Luxury",
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default function AccountPage() {
  const runtimeMode = getServerCommerceRuntimeMode();

  return (
    <main className={`${commerce.shell} ${styles.compte}`}>
      <StoreHeader />

      {runtimeMode === "preproduction" && (
        <aside className={`${styles.compteAvis} aj-label`}>
          <T id="account.privateDemoNotice" />
        </aside>
      )}

      {runtimeMode === "preproduction" ? (
        <AccountClient />
      ) : runtimeMode === "production" ? (
        <ProductionAccountClient />
      ) : (
        <div className={styles.compteFerme}>
          <p className={`${styles.compteSurtitre} aj-label`}>
            AJ Luxury · <T id="account.accessLabel" />
          </p>
          <h1 className={`${styles.compteTitre} aj-display`}>
            Espace client fermé
          </h1>
          <p className={styles.compteLead}>
            Le commerce n’est pas disponible dans cet environnement.
          </p>

          {/* Ce que cet espace portera quand il ouvrira. On l'annonce sans
              le simuler : aucun formulaire de connexion, aucun champ, rien
              qui laisse croire qu'une donnée est collectée ici. */}
          <div className={styles.compteCartes}>
            <div className={styles.compteCarte}>
              <span className={styles.compteCarteLabel}>
                <T id="account.ordersLabel" />
              </span>
              <h2>
                <T id="account.ordersTitle" />
              </h2>
              <p>
                <T id="account.ordersBody" />
              </p>
            </div>

            <div className={styles.compteCarte}>
              <span className={styles.compteCarteLabel}>
                <T id="account.profileLabel" />
              </span>
              <h2>
                <T id="account.profileTitle" />
              </h2>
              <p>
                <T id="account.profileBody" />
              </p>
            </div>

            <div className={styles.compteCarte}>
              <span className={styles.compteCarteLabel}>
                <T id="account.securityLabel" />
              </span>
              <h2>
                <T id="account.securityTitle" />
              </h2>
              <p>
                <T id="account.securityBody" />
              </p>
            </div>
          </div>

          {/* Trois liens, pas un repère de navigation : le <nav> du site est
              déjà dans l'en-tête et dans le pied. En ajouter un troisième,
              non nommé, encombrerait la liste des repères d'un lecteur
              d'écran sans rien lui apprendre. */}
          <div className={styles.compteLiens}>
            <Link
              className={`${styles.action} ${styles.actionDiscrete}`}
              href="/shop"
            >
              <span className={styles.actionTexte}>
                <T id="footer.collection" />
                <span aria-hidden="true" className={styles.actionFilet} />
              </span>
              <span aria-hidden="true" className={styles.fleche}>
                →
              </span>
            </Link>

            <Link
              className={`${styles.action} ${styles.actionDiscrete}`}
              href="/notre-histoire"
            >
              <span className={styles.actionTexte}>
                <T id="footer.story" />
                <span aria-hidden="true" className={styles.actionFilet} />
              </span>
              <span aria-hidden="true" className={styles.fleche}>
                →
              </span>
            </Link>

            <Link
              className={`${styles.action} ${styles.actionDiscrete}`}
              href="/contact"
            >
              <span className={styles.actionTexte}>
                <T id="nav.contact" />
                <span aria-hidden="true" className={styles.actionFilet} />
              </span>
              <span aria-hidden="true" className={styles.fleche}>
                →
              </span>
            </Link>
          </div>

          <p className={styles.compteNote}>
            <T id="account.demoNotice" />
          </p>
        </div>
      )}

      <StoreFooter />
    </main>
  );
}
