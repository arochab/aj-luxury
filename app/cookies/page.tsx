import InfoPage, { InfoNotice, InfoTable } from "../components/InfoPage";
import { LEGAL_CONTACT, LEGAL_VERSION } from "@/lib/legal";
import { T } from "@/lib/i18n/TranslatedText";

export const metadata = { title: "Cookies et traceurs | AJ Luxury" };

export default function CookiesPage() {
  return (
    <InfoPage
      eyebrow={<T id="info.cookies.eyebrow" values={{ version: LEGAL_VERSION }} />}
      title={<T id="info.cookies.title" />}
      status={<T id="info.cookies.status" />}
      officialFrenchOnly
    >
      <InfoNotice>
        <p>
          <strong>À ce jour :</strong> aucun outil publicitaire, pixel social ou
          outil de mesure d’audience nécessitant un consentement n’est activé.
          Le site utilise seulement deux stockages locaux liés à l’interface.
        </p>
      </InfoNotice>

      <section>
        <h2>1. Technologies actuellement utilisées</h2>
        <InfoTable>
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Technologie</th>
                <th>Finalité</th>
                <th>Durée</th>
                <th>Consentement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>aj-luxury.locale.v1</code>
                </td>
                <td>Stockage local</td>
                <td>Mémoriser la langue explicitement choisie</td>
                <td>Jusqu’à suppression par l’utilisateur</td>
                <td>Non, préférence demandée</td>
              </tr>
              <tr>
                <td>
                  <code>aj-luxury-intro-seen</code>
                </td>
                <td>Stockage de session</td>
                <td>Éviter de rejouer l’introduction à chaque page</td>
                <td>Durée de la session</td>
                <td>Non, fonctionnement de l’interface</td>
              </tr>
            </tbody>
          </table>
        </InfoTable>
        <p>
          Le navigateur permet d’effacer ces données dans ses réglages. Leur
          blocage peut réinitialiser la langue ou relancer l’introduction, sans
          empêcher l’accès au contenu principal.
        </p>
      </section>

      <section>
        <h2>2. Stockages strictement nécessaires à la future boutique</h2>
        <p>
          Lors de l’activation du commerce, des cookies techniques pourront être
          nécessaires à la sécurité, à l’authentification, au panier, au
          paiement, à la prévention de la fraude et à la mémorisation des choix
          de confidentialité. Ils ne serviront pas à suivre l’utilisateur à des
          fins publicitaires et seront limités à la durée nécessaire.
        </p>
        <p>
          Selon les protections activées, l’hébergeur peut déposer ponctuellement
          un cookie de sécurité pour distinguer un accès légitime d’un trafic
          automatisé. Ces traceurs de sécurité sont utilisés uniquement lorsque
          nécessaires au fonctionnement ou à la protection du service.
        </p>
      </section>

      <section>
        <h2>3. Audience, personnalisation et publicité</h2>
        <p>
          Aucun traceur non essentiel ne sera déposé avant un choix positif.
          S’ils sont ajoutés, le bandeau présentera au même niveau des actions
          aussi simples pour <strong>tout accepter</strong> ou{" "}
          <strong>tout refuser</strong>, ainsi qu’un réglage par finalité. Les
          traceurs refusés resteront bloqués.
        </p>
        <p>
          Le choix sera conservé pendant une durée de référence de six mois,
          sauf justification différente. Il pourra être modifié à tout moment
          depuis un lien permanent « Gérer mes cookies ».
        </p>
      </section>

      <section>
        <h2>4. Gérer les stockages</h2>
        <p>
          Tant qu’aucun traceur soumis au consentement n’est activé, aucun
          bandeau n’est affiché. Les données locales actuelles peuvent être
          supprimées depuis les paramètres du navigateur. Dès qu’un outil
          d’audience, de publicité ou de média social non exempté sera connecté,
          le gestionnaire de consentement sera activé avant cet outil.
        </p>
        <p>
          Toute question peut être adressée à{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>.
        </p>
      </section>
    </InfoPage>
  );
}
