import InfoPage, { InfoNotice, InfoTable } from "../components/InfoPage";
import {
  HOSTING_PROVIDER,
  LEGAL_CONTACT,
  LEGAL_VERSION_DISPLAY,
  SELLER_IDENTITY,
} from "@/lib/legal";
import { T } from "@/lib/i18n/TranslatedText";

export const metadata = {
  title: "Politique de confidentialité | AJ Luxury",
};

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow={<T id="info.privacy.eyebrow" values={{ version: LEGAL_VERSION_DISPLAY }} />}
      title={<T id="info.privacy.title" />}
      status={<T id="info.privacy.status" />}
      officialFrenchOnly
    >
      <InfoNotice>
        <p>
          <strong>En bref.</strong> AJ Luxury utilise uniquement les données
          nécessaires au fonctionnement du site, au compte client, à la
          commande, au paiement, à la livraison et au service après-vente. Les
          données ne sont pas vendues et aucun outil publicitaire tiers n’est
          activé.
        </p>
      </InfoNotice>

      <section>
        <h2>1. Responsable du traitement</h2>
        <p>
          Le responsable des traitements liés à la boutique est{" "}
          <strong>{SELLER_IDENTITY.legalName}</strong>, établi à{" "}
          <strong>{SELLER_IDENTITY.registeredOffice}</strong>. Pour toute
          question ou demande relative aux données :{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>.
        </p>
      </section>

      <section>
        <h2>2. Données, finalités et durées</h2>
        <InfoTable label="Données, finalités et durées de conservation">
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
                <td>Pilotage agrégé de la boutique</td>
                <td>Volumes de commandes, paiements, stock, livraison, retours et e-mails, sans profil publicitaire</td>
                <td>Intérêt légitime à exploiter et sécuriser la boutique</td>
                <td>Données opérationnelles selon les obligations applicables ; vues de pilotage agrégées</td>
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
          Le paiement en ligne retenu est <strong>Stripe Checkout</strong> : la
          saisie de la carte s’effectue sur l’interface sécurisée de Stripe. AJ
          Luxury ne reçoit ni ne conserve le numéro complet de carte ou son
          cryptogramme. Seuls les références techniques, états et montants
          nécessaires au rapprochement de la commande sont conservés.
        </p>
      </section>

      <section>
        <h2>4. Destinataires et sous-traitants</h2>
        <p>
          L’accès est limité aux personnes habilitées d’AJ Luxury et aux
          prestataires strictement nécessaires : hébergement, paiement,
          authentification, livraison, e-mails transactionnels et support.
        </p>
        <p>
          Le site est hébergé par {HOSTING_PROVIDER.name},{" "}
          {HOSTING_PROVIDER.address}. Les prestataires techniques retenus pour
          la boutique sont <strong>Cloudflare</strong> (exécution et base de
          données), <strong>Stripe</strong> (paiement), <strong>Sendcloud</strong>
          (tarifs, points relais, expédition et retours) et <strong>Resend</strong>
          (e-mails transactionnels). Aucune donnée client n’est vendue et aucun
          SDK publicitaire tiers n’est activé.
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
          Des mesures techniques et organisationnelles proportionnées sont
          appliquées : limitation des accès, chiffrement des échanges,
          authentification adaptée, sauvegardes et journalisation des incidents.
          La boutique ne cible pas spécifiquement les mineurs ; une commande
          suppose la capacité juridique de contracter.
        </p>
      </section>

      <section>
        <h2>8. Évolution de la politique</h2>
        <p>
          La politique sera mise à jour lorsque les traitements ou prestataires
          évolueront. En cas de modification
          substantielle, l’information sera portée à la connaissance des
          utilisateurs par un moyen adapté.
        </p>
      </section>
    </InfoPage>
  );
}
