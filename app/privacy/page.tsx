import InfoPage, { InfoNotice, InfoTable } from "../components/InfoPage";
import {
  HOSTING_PROVIDER,
  LEGAL_CONTACT,
  LEGAL_VERSION,
  SELLER_IDENTITY,
} from "@/lib/legal";

export const metadata = {
  title: "Politique de confidentialité | AJ Luxury",
};

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow={`Données personnelles · version du ${LEGAL_VERSION}`}
      title="Politique de confidentialité."
      status="Version de pré-lancement · liste des prestataires à actualiser avant toute collecte commerciale"
    >
      <InfoNotice>
        <p>
          <strong>État actuel.</strong> La prévisualisation ne permet pas encore
          de créer un compte, payer, passer une commande ou s’inscrire à une
          newsletter. Elle mémorise uniquement la langue choisie et l’affichage
          de l’introduction sur l’appareil.
        </p>
      </InfoNotice>

      <section>
        <h2>1. Responsable du traitement</h2>
        <p>
          Le responsable des traitements liés à la future boutique est{" "}
          <strong>{SELLER_IDENTITY.legalName}</strong>, établi à{" "}
          <strong>{SELLER_IDENTITY.registeredOffice}</strong>. Pour toute
          question ou demande relative aux données :{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>.
        </p>
      </section>

      <section>
        <h2>2. Données, finalités et durées</h2>
        <InfoTable>
          <table>
            <thead>
              <tr>
                <th>Traitement</th>
                <th>Données principales</th>
                <th>Base légale</th>
                <th>Durée de référence</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Navigation, sécurité et prévention des abus</td>
                <td>Adresse IP, journaux techniques, appareil, événements de sécurité</td>
                <td>Intérêt légitime à sécuriser le site</td>
                <td>Jusqu’à 12 mois, sauf incident ou obligation différente</td>
              </tr>
              <tr>
                <td>Préférences d’interface</td>
                <td>Langue choisie et introduction déjà affichée</td>
                <td>Fonctionnement demandé par l’utilisateur</td>
                <td>Jusqu’à suppression locale ; session pour l’introduction</td>
              </tr>
              <tr>
                <td>Compte client</td>
                <td>Identité, e-mail, adresses, historique et préférences</td>
                <td>Exécution du contrat et mesures précontractuelles</td>
                <td>Vie du compte puis 3 ans après la dernière activité, hors archives légales</td>
              </tr>
              <tr>
                <td>Commande, livraison et service client</td>
                <td>Identité, coordonnées, panier, paiement, échanges et preuves</td>
                <td>Exécution du contrat et obligations légales</td>
                <td>Relation commerciale puis archives limitées aux délais légaux</td>
              </tr>
              <tr>
                <td>Facturation et comptabilité</td>
                <td>Factures, commandes et pièces justificatives</td>
                <td>Obligation légale</td>
                <td>10 ans</td>
              </tr>
              <tr>
                <td>Prospection par e-mail</td>
                <td>E-mail, consentement, interactions</td>
                <td>Consentement ou exception légale pour clients similaires</td>
                <td>Jusqu’au retrait, puis au plus 3 ans après le dernier contact actif</td>
              </tr>
              <tr>
                <td>Mesure d’audience non exemptée et publicité</td>
                <td>Identifiants, navigation, conversion</td>
                <td>Consentement</td>
                <td>Selon l’outil retenu et la durée annoncée dans le bandeau</td>
              </tr>
            </tbody>
          </table>
        </InfoTable>
        <p>
          Seules les données adéquates et nécessaires sont collectées. Les champs
          obligatoires seront identifiés au moment de la collecte ; leur absence
          pourra empêcher la création du compte, la commande ou le traitement de
          la demande concernée.
        </p>
      </section>

      <section>
        <h2>3. Paiement</h2>
        <p>
          Le paiement sera traité par un prestataire spécialisé dont l’identité
          sera affichée avant activation. AJ Luxury ne conserve pas le
          cryptogramme de la carte. Les éventuelles données de
          carte conservées pour un achat ultérieur le seront uniquement par le
          prestataire, avec le consentement requis et selon ses propres garanties
          de sécurité.
        </p>
      </section>

      <section>
        <h2>4. Destinataires et sous-traitants</h2>
        <p>
          L’accès est limité aux personnes habilitées d’AJ Luxury et aux
          prestataires strictement nécessaires : hébergement, paiement,
          authentification, livraison, e-mails transactionnels, support et, si
          accepté, analyse d’audience ou marketing.
        </p>
        <p>
          La prévisualisation est hébergée par {HOSTING_PROVIDER.name},{" "}
          {HOSTING_PROVIDER.address}. La liste nominative des prestataires sera
          mise à jour avant leur activation. Aucune donnée client n’est vendue.
        </p>
      </section>

      <section>
        <h2>5. Transferts hors Espace économique européen</h2>
        <p>
          Certains prestataires peuvent traiter des données hors de l’Espace
          économique européen. AJ Luxury vérifiera alors l’existence d’une
          décision d’adéquation ou mettra en place les garanties appropriées,
          notamment les clauses contractuelles types de la Commission
          européenne, avec les mesures complémentaires nécessaires.
        </p>
      </section>

      <section>
        <h2>6. Vos droits</h2>
        <p>
          Selon le traitement, toute personne dispose de droits d’accès, de
          rectification, d’effacement, de limitation, d’opposition et de
          portabilité, ainsi que du droit de retirer son consentement à tout
          moment. Elle peut aussi définir des directives relatives au sort de ses
          données après son décès.
        </p>
        <p>
          Une demande peut être adressée à{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>.
          Une preuve d’identité ne sera demandée qu’en cas de doute raisonnable.
          AJ Luxury répond en principe sous un mois. En cas de difficulté, une
          réclamation peut être déposée auprès de la{" "}
          <a href="https://www.cnil.fr/fr/plaintes" rel="noreferrer">
            CNIL
          </a>.
        </p>
      </section>

      <section>
        <h2>7. Sécurité et mineurs</h2>
        <p>
          Des mesures techniques et organisationnelles proportionnées seront
          appliquées : limitation des accès, chiffrement des échanges,
          authentification adaptée, sauvegardes et journalisation des incidents.
          La boutique ne cible pas spécifiquement les mineurs ; une commande
          suppose la capacité juridique de contracter.
        </p>
      </section>

      <section>
        <h2>8. Évolution de la politique</h2>
        <p>
          La politique sera mise à jour lorsque les outils de production seront
          choisis ou lorsque les traitements évolueront. En cas de modification
          substantielle, l’information sera portée à la connaissance des
          utilisateurs par un moyen adapté.
        </p>
      </section>
    </InfoPage>
  );
}
