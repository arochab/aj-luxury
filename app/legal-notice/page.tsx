import InfoPage, { InfoNotice } from "../components/InfoPage";
import {
  HOSTING_PROVIDER,
  LEGAL_CONTACT,
  LEGAL_VERSION_DISPLAY,
  SELLER_IDENTITY,
  SELLER_TAX_STATUS,
} from "@/lib/legal";
import { T } from "@/lib/i18n/TranslatedText";

export const metadata = { title: "Mentions légales | AJ Luxury" };

export default function LegalNoticePage() {
  return (
    <InfoPage
      eyebrow={<T id="info.legal.eyebrow" values={{ version: LEGAL_VERSION_DISPLAY }} />}
      title={<T id="info.legal.title" />}
      status={<T id="info.legal.status" />}
      officialFrenchOnly
    >
      <InfoNotice>
        <p>
          <strong>Informations légales.</strong> L’identité du vendeur, son
          immatriculation, son siège et le directeur de publication figurent
          ci-dessous. Le vendeur ne collecte pas de TVA au titre de la franchise
          en base. Aucun numéro de téléphone n’est publié tant qu’aucune ligne
          professionnelle n’est disponible.
        </p>
      </InfoNotice>

      <section>
        <h2>1. Éditeur du site</h2>
        <dl>
          <div>
            <dt>Marque</dt>
            <dd>{LEGAL_CONTACT.brand}</dd>
          </div>
          <div>
            <dt>Nom ou raison sociale</dt>
            <dd>{SELLER_IDENTITY.legalName}</dd>
          </div>
          <div>
            <dt>Forme juridique et capital</dt>
            <dd>{SELLER_IDENTITY.legalForm}</dd>
          </div>
          <div>
            <dt>Siège social</dt>
            <dd>{SELLER_IDENTITY.registeredOffice}</dd>
          </div>
          <div>
            <dt>Immatriculation</dt>
            <dd>{SELLER_IDENTITY.registration}</dd>
          </div>
          {SELLER_IDENTITY.vatNumber ? (
            <div>
              <dt>TVA intracommunautaire</dt>
              <dd>{SELLER_IDENTITY.vatNumber}</dd>
            </div>
          ) : null}
          <div>
            <dt>TVA</dt>
            <dd>{SELLER_TAX_STATUS.invoiceMention}</dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd>
              <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>
            </dd>
          </div>
          {/* La ligne n'existe que si le numéro existe. Voir LEGAL_CONTACT
              dans lib/legal.ts : afficher un texte d'attente ne satisferait
              pas davantage la LCEN et signalerait une marque non prête. */}
          {LEGAL_CONTACT.phone ? (
            <div>
              <dt>Téléphone</dt>
              <dd>{LEGAL_CONTACT.phone}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section>
        <h2>2. Direction de la publication</h2>
        <p>{SELLER_IDENTITY.publicationDirector}.</p>
      </section>

      <section>
        <h2>3. Hébergement</h2>
        <dl>
          <div>
            <dt>Hébergeur</dt>
            <dd>{HOSTING_PROVIDER.name}</dd>
          </div>
          <div>
            <dt>Adresse</dt>
            <dd>{HOSTING_PROVIDER.address}</dd>
          </div>
          <div>
            <dt>Téléphone</dt>
            <dd>{HOSTING_PROVIDER.phone}</dd>
          </div>
          <div>
            <dt>Site</dt>
            <dd>
              <a href={HOSTING_PROVIDER.website} rel="noreferrer">
                cloudflare.com
              </a>
            </dd>
          </div>
        </dl>
        <p>
          Ces informations décrivent l’hébergement de la prévisualisation et
          devront être actualisées si l’environnement de production change.
        </p>
      </section>

      <section>
        <h2>4. Propriété intellectuelle</h2>
        <p>
          La structure du site, les textes, photographies, vidéos, créations
          graphiques, marques et logos sont protégés par les droits de propriété
          intellectuelle de leurs titulaires. Toute reproduction, représentation,
          adaptation ou exploitation non autorisée, totale ou partielle, est
          interdite.
        </p>
        <p>
          Les droits sur les contenus remis par AJ Luxury restent soumis aux
          accords conclus avec leurs auteurs, photographes, modèles ou
          prestataires. Toute demande d’autorisation doit être adressée à{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>.
        </p>
      </section>

      <section>
        <h2>5. Responsabilité et liens</h2>
        <p>
          AJ Luxury s’efforce de maintenir des informations exactes et un accès
          sécurisé. Elle ne peut toutefois garantir une disponibilité
          ininterrompue. Les liens vers des sites tiers sont fournis à titre
          informatif ; AJ Luxury n’en contrôle ni le contenu ni les pratiques.
          Aucune clause de cette page ne limite les droits impératifs des
          consommateurs.
        </p>
      </section>

      <section>
        <h2>6. Données et réclamations</h2>
        <p>
          Les traitements sont décrits dans la{" "}
          <a href="/privacy">politique de confidentialité</a> et la{" "}
          <a href="/cookies">politique cookies</a>. Les règles commerciales et
          le règlement des litiges figurent dans les{" "}
          <a href="/terms">conditions générales de vente</a>.
        </p>
      </section>
    </InfoPage>
  );
}
