import InfoPage, { InfoNotice, InfoTable } from "../components/InfoPage";
import { LEGAL_CONTACT, LEGAL_VERSION_DISPLAY } from "@/lib/legal";
import { T } from "@/lib/i18n/TranslatedText";

export const metadata = { title: "Cookies et traceurs | AJ Luxury" };

export default function CookiesPage() {
  return (
    <InfoPage
      eyebrow={<T id="info.cookies.eyebrow" values={{ version: LEGAL_VERSION_DISPLAY }} />}
      title={<T id="info.cookies.title" />}
      status={<T id="info.cookies.status" />}
      officialFrenchOnly
    >
      <InfoNotice>
        <p>
          AJ Luxury n’utilise aucun traceur publicitaire, pixel social ou outil
          de mesure d’audience. Les seuls stockages utilisés servent au panier,
          au compte client, à la sécurité et aux préférences demandées par
          l’utilisateur.
        </p>
      </InfoNotice>

      <section>
        <h2>Préférences d’affichage</h2>
        <InfoTable label="Stockages des préférences d’affichage">
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
                <td>Non</td>
              </tr>
              <tr>
                <td>
                  <code>aj-luxury-intro-seen</code>
                </td>
                <td>Stockage de session</td>
                <td>Éviter de rejouer l’introduction à chaque page</td>
                <td>Jusqu’à la fermeture de l’onglet</td>
                <td>Non</td>
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
        <h2>Panier, compte et sécurité</h2>
        <p>
          Ces cookies sont strictement nécessaires aux fonctions demandées par
          l’utilisateur. Ils ne servent ni à la publicité ni au suivi de la
          navigation à des fins marketing.
        </p>
        <InfoTable label="Cookies nécessaires au fonctionnement de la boutique">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Finalité</th>
                <th>Durée maximale</th>
                <th>Consentement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>__Host-aj_cart</code><br /><code>__Host-aj_cart_csrf</code></td>
                <td>Conserver et protéger le panier</td>
                <td>7 jours</td>
                <td>Non</td>
              </tr>
              <tr>
                <td><code>__Host-aj_customer</code><br /><code>__Host-aj_customer_csrf</code></td>
                <td>Authentifier et protéger le compte client</td>
                <td>7 jours maximum</td>
                <td>Non</td>
              </tr>
              <tr>
                <td><code>__Host-aj_pending_customer</code></td>
                <td>Sécuriser une création de compte en cours</td>
                <td>1 heure</td>
                <td>Non</td>
              </tr>
              <tr>
                <td><code>__Host-aj_guest_order</code><br /><code>__Host-aj_guest_order_csrf</code></td>
                <td>Permettre le suivi sécurisé d’une commande sans compte</td>
                <td>24 heures maximum</td>
                <td>Non</td>
              </tr>
            </tbody>
          </table>
        </InfoTable>
        <p>
          L’infrastructure d’hébergement peut également utiliser un cookie de
          sécurité temporaire pour protéger le site contre les accès automatisés
          ou malveillants.
        </p>
      </section>

      <section>
        <h2>Mesure d’audience et publicité</h2>
        <p>
          Aucun traceur de mesure d’audience, de publicité personnalisée ou de
          réseau social n’est chargé sur le site. Aucun partenaire publicitaire
          ne reçoit donc de données de navigation depuis AJ Luxury.
        </p>
        <p>
          Si ces usages évoluent, la présente politique sera mise à jour et les
          traceurs concernés resteront bloqués jusqu’au choix de l’utilisateur.
          Accepter et refuser seront proposés avec la même simplicité, et le
          choix restera modifiable à tout moment.
        </p>
      </section>

      <section>
        <h2>Gérer les données enregistrées</h2>
        <p>
          Aucun bandeau de consentement n’est affiché parce qu’aucun traceur
          soumis au consentement n’est utilisé. Les cookies et stockages
          techniques peuvent être supprimés depuis les réglages du navigateur.
          Cette suppression peut vider le panier, déconnecter le compte ou
          réinitialiser la langue choisie.
        </p>
        <p>
          Toute question peut être adressée à{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>.
        </p>
      </section>
    </InfoPage>
  );
}
