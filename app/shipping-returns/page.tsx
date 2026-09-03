import InfoPage, { InfoNotice } from "../components/InfoPage";
import {
  LEGAL_CONTACT,
  LEGAL_VERSION_DISPLAY,
  RETURN_ADDRESS,
} from "@/lib/legal";
import { T } from "@/lib/i18n/TranslatedText";

export const metadata = { title: "Livraison internationale et retours | AJ Luxury" };

export default function ShippingReturnsPage() {
  return (
    <InfoPage
      eyebrow={<T id="info.shipping.eyebrow" values={{ version: LEGAL_VERSION_DISPLAY }} />}
      title={<T id="info.shipping.title" />}
      status={<T id="info.shipping.status" />}
      officialFrenchOnly
    >
      <InfoNotice>
        <p>
          <strong>Avant de payer.</strong> Le client voit les modes de livraison
          réellement disponibles pour son adresse, leur prix et leur délai
          estimé. Une destination sans offre affichée ne peut pas être commandée.
        </p>
      </InfoNotice>

      <section>
        <h2>Livraison</h2>
        <p>
          AJ Luxury livre en France métropolitaine, Corse comprise, dans les
          autres pays de l’Union européenne et, hors Union européenne, au
          Royaume-Uni, aux États-Unis, au Canada, aux Émirats arabes unis, au
          Qatar et en Arabie saoudite. Une destination n’est commandable que si
          une offre transporteur réelle s’affiche avant le paiement. Les autres
          destinations et les territoires spéciaux restent fermés tant qu’aucune
          offre complète n’est disponible.
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
          Pour une livraison hors Union européenne, l’expédition est proposée
          selon l’Incoterm DAP : AJ Luxury prend en charge le transport et les
          formalités d’exportation jusqu’à la destination convenue ; les droits,
          taxes et frais d’importation éventuellement exigés dans le pays de
          destination restent à la charge du destinataire. Ils peuvent être
          demandés par le transporteur ou les douanes avant la remise du colis.
          Le numéro EORI du vendeur et les données douanières nécessaires sont
          transmis au transporteur lors de la création de l’expédition.
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
          Une fois le remboursement confirmé, un avoir numéroté et relié à la
          facture initiale est automatiquement ajouté au dossier A4 de la
          commande dans l’espace client.
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
