import Link from "next/link";
import StoreFooter from "./StoreFooter";
import StoreHeader from "./StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";

/* ==========================================================================
   La page introuvable — une seule, servie partout
   --------------------------------------------------------------------------
   Relevé au navigateur le 22/08 : une adresse inconnue rendait 160 octets de
   HTML — « Not Found », sans en-tête, sans pied, sans un seul lien. Un
   visiteur qui se trompe d'URL, ou qui suit un lien mort, arrivait dans un
   cul-de-sac : plus de navigation, plus de marque, aucune sortie.

   POURQUOI CE COMPOSANT EXISTE AU LIEU D'UN SEUL `app/not-found.tsx`.
   La racine sert bien les routes non reconnues, mais un `notFound()` levé
   DEPUIS une page — la fiche produit le fait quand le coloris n'existe pas —
   ne la rend pas dans cette version de vinext : mesuré, 9 octets contre
   19 244. Il faut donc un `not-found.tsx` à côté de la route dynamique. Pour
   qu'il n'existe pas deux pages d'erreur divergentes, les deux fichiers ne
   font que rendre CE composant.

   Ce que la page fait, et rien de plus :
     • elle garde la barre et le pied, donc la navigation n'est jamais perdue ;
     • elle dit ce qui s'est passé en une phrase, sans code d'erreur — « 404 »
       ne veut rien dire pour un client ;
     • elle propose une sortie principale, la boutique, et une secondaire,
       l'accueil. Même grammaire d'actions que la clôture de l'accueil.

   Aucun mouvement, aucun champ métallique : une page d'erreur doit ARRIVER,
   pas se jouer, et elle n'a pas à ouvrir un contexte WebGL pour dire qu'une
   adresse n'existe pas.
   ========================================================================== */

export default function PageIntrouvable() {
  return (
    <main className="aj-erreur">
      <StoreHeader />

      <section className="aj-erreur__bloc" aria-labelledby="aj-erreur-titre">
        <p className="aj-erreur__surtitre">
          <T id="error.notFoundEyebrow" />
        </p>

        <h1 className="aj-display aj-erreur__titre" id="aj-erreur-titre">
          <T id="error.notFoundTitle" />
        </h1>

        <p className="aj-erreur__texte">
          <T id="error.notFoundBody" />
        </p>

        <div className="aj-erreur__actions">
          <Link href="/shop">
            <T id="home.viewBoutique" />
          </Link>
          <Link href="/">
            <T id="nav.home" />
          </Link>
        </div>
      </section>

      <StoreFooter />
    </main>
  );
}
