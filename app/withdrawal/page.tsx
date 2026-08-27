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
      <InfoNotice>
        <p>
          <strong>Exercer votre droit.</strong> Envoyez une déclaration claire à{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>
          {" "}dans les quatorze jours suivant la réception de la commande.
        </p>
      </InfoNotice>

      <section>
        <h2>Comment faire</h2>
        <ol>
          <li>indiquez l’e-mail et le numéro de commande ;</li>
          <li>précisez le ou les produits concernés ;</li>
          <li>déclarez sans ambiguïté votre décision de vous rétracter ;</li>
          <li>conservez la preuve d’envoi de votre demande.</li>
        </ol>
        <p>
          Vous pouvez utiliser le modèle figurant dans les conditions générales
          de vente, sans que ce modèle soit obligatoire.
        </p>
      </section>

      <section>
        <h2>Autre moyen de contact</h2>
        <p>
          Une déclaration claire peut être envoyée à{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>.
          Cette démarche est gratuite et ne réduit pas le délai légal de
          quatorze jours.
        </p>
      </section>
    </InfoPage>
  );
}
