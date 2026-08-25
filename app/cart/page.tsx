import Link from "next/link";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";
import CartClient from "./CartClient";
import styles from "./CommerceShell.module.css";
import tunnel from "../components/Tunnel.module.css";
import { getServerCommerceRuntimeMode } from "../../lib/commerce/commerce-runtime.server";

export const metadata = {
  title: "Votre panier | AJ Luxury",
  robots: { index: false, follow: false },
};

/**
 * Le fil des trois étapes. Il est le seul élément commun aux trois écrans du
 * tunnel : c'est lui qui dit où l'on est et ce qu'il reste.
 *
 * Il est recopié à l'identique dans les trois pages. C'est volontaire et non
 * satisfaisant : aucun fichier de composant partagé n'appartient au périmètre
 * de cet écran, et créer app/components/FilDEtapes.tsx aurait mordu sur celui
 * d'un autre agent. À factoriser dès que le périmètre le permet.
 *
 * Aucune étape n'est un lien : sur /cart, le rendu serveur ne doit pas
 * contenir href="/checkout" — le parcours ne s'ouvre qu'une fois le panier
 * chargé côté client (tests/rendered-html.test.mjs).
 */
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

export default function CartPage() {
  const runtimeMode = getServerCommerceRuntimeMode();
  return (
    <main className={`${styles.shell} ${tunnel.sol}`}>
      <StoreHeader />
      <div className={tunnel.tunnel}>
        {/* Commerce fermé : AUCUN fil d'étapes. Dessiner 01/02/03 promettrait
            un parcours d'achat qui n'existe pas — le handoff du 21/08 le
            comptait comme défaut, et l'intouchable « aucun tunnel simulé »
            le proscrit. Le fil ne se montre qu'avec un vrai parcours. */}
        {runtimeMode !== "closed" && <FilDEtapes etape={1} />}

        {runtimeMode === "preproduction" && (
          <aside className={tunnel.avis}>
            <span className={tunnel.avisMarque}>Préproduction</span>
            <T id="cart.preprodNotice" />
          </aside>
        )}

        {runtimeMode === "closed" ? (
          /*
           * Commerce fermé — l'état que voit la démonstration. On ne monte pas
           * CartClient ici : sans API de panier, il n'aurait rien à charger et
           * afficherait « Le panier est momentanément indisponible, réessayez
           * dans un instant », ce qui laisse croire à une panne passagère
           * alors que la boutique est fermée par décision. Un état vide doit
           * dire la vérité, et rouvrir une porte vers la collection.
           */
          <section className={tunnel.scene} aria-labelledby="cart-closed-title">
            <p className={tunnel.oeil}>Panier</p>
            <h1 className={tunnel.geste} id="cart-closed-title">
              La collection avant le panier.
            </h1>
            <p className={tunnel.lede}>
              La vente en ligne n’est pas encore ouverte : ce site est une
              démonstration. Rien n’est enregistré, rien n’est débité, et aucune
              donnée bancaire n’est collectée.
            </p>
            <ul className={`${tunnel.gages} ${tunnel.montee}`}>
              <li>
                <span>Paiement</span>
                <strong>Fermé</strong>
              </li>
              <li>
                <span>Données bancaires</span>
                <strong>Aucune collecte</strong>
              </li>
              <li>
                <span>Ce site</span>
                <strong>Démonstration privée</strong>
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
        ) : (
          <div className={tunnel.commerce}>
            <CartClient runtimeMode={runtimeMode} />
          </div>
        )}
      </div>
      <StoreFooter />
    </main>
  );
}
