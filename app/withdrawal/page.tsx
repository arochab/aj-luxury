import InfoPage, { InfoNotice } from "../components/InfoPage";
import { LEGAL_CONTACT, LEGAL_VERSION_DISPLAY } from "@/lib/legal";
import { T } from "@/lib/i18n/TranslatedText";

/* Aligné sur le libellé servi après hydratation (footer.withdrawal) et sur le
   lien du pied de page : une seule formulation par page. « Renoncer au
   contrat » n'apparaissait nulle part ailleurs sur le site. */
export const metadata = { title: "Droit de rétractation | AJ Luxury" };

export default function WithdrawalPage() {
  return (
    <InfoPage
      eyebrow={<T id="info.withdrawal.eyebrow" values={{ version: LEGAL_VERSION_DISPLAY }} />}
      title={<T id="info.withdrawal.title" />}
      status={<T id="info.withdrawal.status" />}
      officialFrenchOnly
    >
      <InfoNotice warning>
        <p>
          <strong>La boutique est encore en prévisualisation.</strong> Aucune
          commande réelle ne peut avoir été conclue sur ce site ; le formulaire
          de rétractation n’est donc pas encore activé.
        </p>
      </InfoNotice>

      <section>
        <h2>Fonctionnement prévu à l’ouverture</h2>
        <ol>
          <li>identifier la commande avec l’e-mail et le numéro de commande ;</li>
          <li>sélectionner le ou les produits concernés ;</li>
          <li>confirmer explicitement la rétractation ;</li>
          <li>
            recevoir immédiatement un accusé horodaté par e-mail, avec le
            contenu de la déclaration et les instructions de retour.
          </li>
        </ol>
        <p>
          Cette fonctionnalité sera accessible sans connexion et sans frais
          pendant toute la durée légale du droit de rétractation.
        </p>
      </section>

      <section>
        <h2>Autre moyen de contact</h2>
        <p>
          Une déclaration claire pourra aussi être envoyée à{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>.
          L’utilisation de la fonctionnalité en ligne ne sera pas obligatoire et
          ne réduira pas le délai légal de quatorze jours.
        </p>
      </section>
    </InfoPage>
  );
}
