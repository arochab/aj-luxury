import Link from "next/link";
import StoreFooter from "../../components/StoreFooter";
import StoreHeader from "../../components/StoreHeader";
import { T } from "../../../lib/i18n/TranslatedText";
import { getServerCommerceRuntimeMode } from "../../../lib/commerce/commerce-runtime.server";
import styles from "../../cart/CommerceShell.module.css";
import tunnel from "../../components/Tunnel.module.css";
import ProductionCheckoutSuccessClient from "./ProductionCheckoutSuccessClient";

export const metadata = {
  title: "Confirmation de paiement | AJ Luxury",
  robots: { index: false, follow: false },
};

/** Voir la note dans app/cart/page.tsx : recopié faute de fichier partagé. */
function FilDEtapes({ etape }: { etape: 1 | 2 | 3 }) {
  const etapes = ["Panier", "Livraison", "Confirmation"];
  return (
    <nav className={tunnel.fil} aria-label="Étapes de la commande">
      <ol className={tunnel.filListe}>
        {etapes.map((nom, index) => {
          const rang = index + 1;
          return (
            <li
              className={
                rang <= etape
                  ? `${tunnel.filEtape} ${tunnel.filFaite}`
                  : tunnel.filEtape
              }
              key={nom}
              aria-current={rang === etape ? "step" : undefined}
            >
              <span className={tunnel.filRang}>{`0${rang}`}</span>
              <span className={tunnel.filNom}>{nom}</span>
            </li>
          );
        })}
      </ol>
      <span className={tunnel.filPiste} aria-hidden="true">
        <span className={tunnel.filJauge} data-etape={etape} />
      </span>
    </nav>
  );
}

export default function CheckoutSuccessPage() {
  const runtimeMode = getServerCommerceRuntimeMode();
  const commerceOuvert = runtimeMode !== "closed";
  return (
    <main className={`${styles.shell} ${tunnel.sol}`}>
      <StoreHeader />
      {/*
        `.moment` : la classe qui fait de cet écran une arrivée et non un
        accusé de réception. Le fil atteint sa troisième étape, la jauge se
        remplit, un filet de métal se trace pleine largeur sous elle, et le
        grand lettrage monte. Rien de tout cela ne se pose devant une action :
        les liens de sortie sont lisibles et cliquables dès le premier paint.
      */}
      <div className={`${tunnel.tunnel} ${tunnel.moment}`}>
        <FilDEtapes etape={3} />

        {/*
          La barre de sortie, identique à celle de /checkout. Sans elle, la
          jauge du fil (1 px) et le sceau (1 px) encadraient 46 px de large sur
          1 310 px strictement vides : deux traits parallèles qui n'annonçaient
          rien, en tout premier élément de la page censée rassurer. Le vide
          n'était pas une respiration, c'était une ligne utilitaire à laquelle
          on avait retiré son contenu. On lui rend le sien : par où l'on
          repart, et dans quel état se trouve le commerce.
        */}
        <div className={tunnel.barre}>
          <Link className={tunnel.lien} href="/shop">
            <T id="common.backToCollection" />
          </Link>
          <span
            className={
              commerceOuvert ? `${tunnel.etat} ${tunnel.etatOuvert}` : tunnel.etat
            }
          >
            {runtimeMode === "preproduction" ? (
              <T id="checkout.preprodLabel" />
            ) : runtimeMode === "production" ? (
              "Paiement sécurisé"
            ) : (
              "Commerce fermé"
            )}
          </span>
        </div>

        <span className={tunnel.sceau} aria-hidden="true" />

        {runtimeMode === "production" ? (
          <div className={tunnel.commerce}>
            <ProductionCheckoutSuccessClient />
          </div>
        ) : (
          /*
           * Hors production, cette route est un retour de prestataire qui n'a
           * jamais été appelé. On ne mime donc aucune confirmation : on énonce
           * exactement ce qui n'a pas eu lieu. Une fausse confirmation, même
           * dans une démonstration, serait la seule faute impardonnable d'un
           * tunnel d'achat.
           */
          <section className={tunnel.scene} aria-labelledby="success-closed-title">
            <p className={tunnel.oeil}>Retour de paiement</p>
            <h1 className={tunnel.geste} id="success-closed-title">
              Rien n’a été engagé.
            </h1>
            <p className={tunnel.lede}>
              Cette page est le point de retour du prestataire de paiement. La
              boutique étant fermée, aucun paiement n’a pu être initié : il n’y
              a donc pas de commande à confirmer, et rien n’a été débité.
            </p>
            <ul className={`${tunnel.gages} ${tunnel.montee}`}>
              <li>
                <span>Commande</span>
                <strong>Aucune</strong>
              </li>
              <li>
                <span>Débit</span>
                <strong>Aucun</strong>
              </li>
              <li>
                <span>Confirmation par e-mail</span>
                <strong>Non envoyée</strong>
              </li>
            </ul>
            <div className={tunnel.actions}>
              <Link className={tunnel.action} href="/shop">
                Voir la collection
              </Link>
              <Link className={tunnel.lien} href="/">
                Revenir à l’accueil
              </Link>
            </div>
          </section>
        )}
      </div>
      <StoreFooter />
    </main>
  );
}
