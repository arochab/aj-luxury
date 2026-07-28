import InfoPage from "../components/InfoPage";

export const metadata = { title: "Mentions légales | AJ Luxury" };

export default function LegalNoticePage() {
  return (
    <InfoPage eyebrow="Informations légales" title="Mentions légales.">
      <p>
        Cette page est structurée pour l’ouverture de la boutique. Les données
        signalées « à confirmer » devront être remplacées par les informations
        officielles de l’entreprise avant l’activation des ventes.
      </p>

      <section>
        <h2>Éditeur du site</h2>
        <dl>
          <div>
            <dt>Nom ou raison sociale</dt>
            <dd>AJ Luxury · à confirmer</dd>
          </div>
          <div>
            <dt>Forme juridique et capital social</dt>
            <dd>À confirmer</dd>
          </div>
          <div>
            <dt>Siège social</dt>
            <dd>
              Adresse officielle de domiciliation d’AJ Luxury · à confirmer
            </dd>
          </div>
          <div>
            <dt>Immatriculation</dt>
            <dd>SIREN, SIRET et RCS/RNE · à confirmer</dd>
          </div>
          <div>
            <dt>TVA intracommunautaire</dt>
            <dd>À confirmer, si applicable</dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>
              <a href="mailto:contact@ajluxurystore.com">
                contact@ajluxurystore.com
              </a>
            </dd>
          </div>
          <div>
            <dt>Téléphone</dt>
            <dd>Numéro de contact de l’entreprise · à confirmer</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>Direction de la publication</h2>
        <p>
          Nom du représentant légal ou du responsable de publication d’AJ
          Luxury · à confirmer.
        </p>
      </section>

      <section>
        <h2>Hébergement de la prévisualisation</h2>
        <p>
          Cloudflare, Inc. · 101 Townsend Street, San Francisco, California
          94107, États-Unis ·{" "}
          <a href="https://www.cloudflare.com" rel="noreferrer">
            cloudflare.com
          </a>
        </p>
        <p>
          Ces coordonnées devront être actualisées si l’hébergeur retenu pour
          la boutique finale diffère de celui de la prévisualisation.
        </p>
      </section>

      <section>
        <h2>Propriété intellectuelle</h2>
        <p>
          Les textes, photographies, vidéos, marques, logos et éléments
          graphiques présentés sur ce site restent la propriété de leurs
          titulaires respectifs. Toute reproduction ou utilisation non
          autorisée est interdite.
        </p>
      </section>

      <section>
        <h2>Données personnelles</h2>
        <p>
          Les modalités de traitement des données seront détaillées dans la
          politique de confidentialité avant l’activation des comptes clients,
          du paiement, de la newsletter ou de tout outil de mesure d’audience.
        </p>
      </section>
    </InfoPage>
  );
}
