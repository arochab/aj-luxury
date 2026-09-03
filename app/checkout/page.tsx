import Link from "next/link";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";
import CheckoutClient from "./CheckoutClient";
import ProductionCheckoutClient from "./ProductionCheckoutClient";
import styles from "../cart/CommerceShell.module.css";
import tunnel from "../components/Tunnel.module.css";
import { getServerCommerceRuntimeMode } from "../../lib/commerce/commerce-runtime.server";

export function generateMetadata() {
  const runtimeMode = getServerCommerceRuntimeMode();
  return {
    title: runtimeMode === "production"
      ? "Livraison et paiement | AJ Luxury"
      : runtimeMode === "preproduction"
        ? "Livraison préproduction | AJ Luxury"
        : "Paiement temporairement indisponible | AJ Luxury",
    robots: { index: false, follow: false },
  };
}

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

export default function CheckoutPage() {
  const runtimeMode = getServerCommerceRuntimeMode();
  const commerceOuvert = runtimeMode !== "closed";

  return (
    <main className={styles.shell}>
      <StoreHeader />
      <div className={tunnel.tunnel}>
        {/* Commerce fermé : aucun fil d'étapes — même règle que /cart, un
            parcours ne se dessine que s'il existe. */}
        {commerceOuvert && <FilDEtapes etape={2} />}

        {/*
          La barre de sortie. Deux informations et rien d'autre : par où l'on
          revient, et dans quel état se trouve le commerce. Le point d'état est
          pourpre quand la vente est fermée — la teinte la plus sourde des trois
          coloris, pas un rouge d'alerte emprunté à un système d'exploitation.
        */}
        <div className={tunnel.barre}>
          <Link className={tunnel.lien} href="/cart">
            <T id="checkout.backToCart" />
          </Link>
          <span
            className={
              commerceOuvert ? `${tunnel.etat} ${tunnel.etatOuvert}` : tunnel.etat
            }
          >
            {runtimeMode === "preproduction"
              ? <T id="checkout.preprodLabel" />
              : runtimeMode === "production"
                ? "Paiement sécurisé"
                : "Service indisponible"}
          </span>
        </div>

        {runtimeMode === "preproduction" && (
          <aside className={tunnel.avis}>
            <span className={tunnel.avisMarque}>Préproduction</span>
            <T id="checkout.preprodNotice" />
          </aside>
        )}

        {runtimeMode === "preproduction" ? (
          <div>
            <CheckoutClient />
          </div>
        ) : runtimeMode === "production" ? (
          <div>
            <ProductionCheckoutClient />
          </div>
        ) : (
          /*
           * Commerce fermé. C'est ici que s'arrête la démonstration, et il faut
           * que ce soit clair sans être sec : on dit ce qui n'existe pas
           * (prestataire, débit, saisie de carte), puis on rend la main.
           */
          <section className={tunnel.scene} aria-labelledby="checkout-closed-title">
            <p className={tunnel.oeil}>Livraison et paiement</p>
            <h1 className={tunnel.geste} id="checkout-closed-title">
              Le paiement est temporairement indisponible.
            </h1>
            <p className={tunnel.lede}>
              Réessayez dans un instant. Aucun montant ne peut être engagé et
              aucun numéro de carte n’est collecté sur cet écran.
            </p>
            <ul className={`${tunnel.gages} ${tunnel.montee}`}>
              <li>
                <span>Prestataire</span>
                <strong>Temporairement indisponible</strong>
              </li>
              <li>
                <span>Montant engagé</span>
                <strong>Aucun</strong>
              </li>
              <li>
                <span>Numéro de carte</span>
                <strong>Jamais demandé</strong>
              </li>
            </ul>
            <div className={tunnel.actions}>
              <Link className={tunnel.action} href="/shop">
                Voir la collection
              </Link>
              <Link className={tunnel.lien} href="/cart">
                <T id="checkout.backToCart" />
              </Link>
            </div>
          </section>
        )}
      </div>
      <StoreFooter />
    </main>
  );
}
