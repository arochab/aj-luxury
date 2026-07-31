import InfoPage, { InfoNotice } from "../components/InfoPage";
import { LEGAL_CONTACT, LEGAL_VERSION } from "@/lib/legal";
import { T } from "@/lib/i18n/TranslatedText";

export const metadata = { title: "Livraison et retours | AJ Luxury" };

export default function ShippingReturnsPage() {
  return (
    <InfoPage
      eyebrow={<T id="info.shipping.eyebrow" values={{ version: LEGAL_VERSION }} />}
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
          Les destinations disponibles, le transporteur, le coût et la date ou
          le délai estimé seront affichés avant la validation de la commande.
          Sans délai spécifique convenu, la commande sera livrée au plus tard
          trente jours après sa confirmation.
        </p>
        <p>
          Pour une livraison hors Union européenne, des droits de douane, taxes
          d’importation ou frais de traitement peuvent être exigés à destination.
          Ils seront présentés lorsque connus ; à défaut, le client sera
          clairement informé avant paiement qu’ils peuvent rester à sa charge.
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
          <a href="/withdrawal">Renoncer au contrat ici</a>. Les frais directs de
          retour sont à la charge du client, sauf défaut, non-conformité ou erreur
          d’AJ Luxury.
        </p>
        <p>
          Les sous-vêtements doivent rester non portés, non lavés, non tachés,
          avec leurs étiquettes et leur dispositif d’hygiène intact. Si un
          produit scellé ne peut être renvoyé pour des raisons de santé ou
          d’hygiène après descellement, l’exception légale au droit de
          rétractation peut s’appliquer. Elle ne s’applique jamais au détriment
          de la garantie légale de conformité.
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
