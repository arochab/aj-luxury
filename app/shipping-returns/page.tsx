import InfoPage, { InfoNotice } from "../components/InfoPage";
import {
  LEGAL_CONTACT,
  LEGAL_VERSION_DISPLAY,
  RETURN_ADDRESS,
} from "@/lib/legal";
import { T } from "@/lib/i18n/TranslatedText";

export const metadata = { title: "Livraison en Union européenne et retours | AJ Luxury" };

export default function ShippingReturnsPage() {
  return (
    <InfoPage
      eyebrow={<T id="info.shipping.eyebrow" values={{ version: LEGAL_VERSION_DISPLAY }} />}
      title={<T id="info.shipping.title" />}
      status={<T id="info.shipping.status" />}
      officialFrenchOnly
    >
      <InfoNotice warning>
        <p>
          <strong>Aucune commande réelle n’est encore acceptée.</strong> Les
          modalités ci-dessous définissent le niveau de service attendu. Les
          informations opérationnelles seront publiées et testées avant
          l’activation du paiement.
        </p>
      </InfoNotice>

      <section>
        <h2>Livraison</h2>
        <p>
          Au lancement, AJ Luxury livre en France métropolitaine, Corse comprise,
          et dans les autres pays de l’Union européenne. Les territoires
          ultramarins et les destinations hors Union européenne ne sont pas
          encore desservis.
        </p>
        <p>
          Selon le pays, l’adresse et la disponibilité du transporteur, une
          livraison en point de retrait ou à domicile est proposée. Le coût
          réel, le transporteur et le délai estimé de chaque option disponible
          sont affichés avant le paiement. La commande est préparée sous un à
          deux jours ouvrés. Le délai affiché lors de la commande reste celui
          qui engage AJ Luxury.
        </p>
        <p>
          Le numéro EORI du vendeur est valide. L’ouverture hors Union
          européenne reste néanmoins séparée jusqu’à validation des
          transporteurs, déclarations douanières, droits, taxes et retours pour
          chaque destination.
        </p>
      </section>

      <section>
        <h2>Suivi et incident</h2>
        <p>
          Un e-mail de confirmation puis, lorsque disponible, un lien de suivi
          seront envoyés. En cas de retard, colis perdu, endommagé ou incomplet,
          le client peut contacter{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a> en
          indiquant son numéro de commande. Un signalement rapide facilite le
          recours auprès du transporteur sans réduire les droits légaux du
          client.
        </p>
      </section>

      <section>
        <h2>Rétractation et retours</h2>
        <p>
          Le client dispose de quatorze jours à compter de la réception pour
          notifier sa rétractation, puis de quatorze jours pour expédier le
          produit. La démarche pourra être initiée depuis{" "}
          <a href="/withdrawal">Accéder au formulaire de rétractation</a>. Les frais directs de
          retour sont à la charge du client, sauf défaut, non-conformité ou erreur
          d’AJ Luxury.
        </p>
        <p>
          Après notification de la rétractation, le retour doit être adressé à :{" "}
          <strong>{RETURN_ADDRESS.recipient}</strong>, {RETURN_ADDRESS.line1},{" "}
          {RETURN_ADDRESS.postalCode} {RETURN_ADDRESS.city},{" "}
          {RETURN_ADDRESS.country}.
        </p>
        <p>
          AJ Luxury n’applique pas d’exclusion générale du droit de
          rétractation aux sous-vêtements. Le client peut examiner le produit
          comme il le ferait en magasin, sans le porter au-delà de ce qui est
          nécessaire pour vérifier sa nature, ses caractéristiques et sa
          taille. Les droits liés à un défaut ou à une non-conformité restent
          intégralement applicables.
        </p>
      </section>

      <section>
        <h2>Remboursement</h2>
        <p>
          Le remboursement comprend le prix et les frais de livraison standard
          initiaux. Il est effectué par le moyen de paiement d’origine, sauf
          accord exprès différent, au plus tard quatorze jours après la
          notification. AJ Luxury peut attendre le retour du produit ou une
          preuve d’expédition.
        </p>
        <p>
          Une dépréciation résultant de manipulations allant au-delà de celles
          nécessaires pour vérifier la nature, les caractéristiques et la taille
          peut rester à la charge du client.
        </p>
      </section>

      <section>
        <h2>Produit défectueux ou non conforme</h2>
        <p>
          Les retours au titre des garanties légales sont gratuits. Le client
          doit contacter le service client avec le numéro de commande et une
          description du problème. Selon les conditions légales, AJ Luxury
          proposera la réparation, le remplacement, une réduction du prix ou le
          remboursement.
        </p>
      </section>
    </InfoPage>
  );
}
