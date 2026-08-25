import InfoPage, { InfoNotice } from "../components/InfoPage";
import {
  LEGAL_CONTACT,
  LEGAL_VERSION_DISPLAY,
  MEDIATOR,
  SELLER_IDENTITY,
} from "@/lib/legal";
import { T } from "@/lib/i18n/TranslatedText";

export const metadata = {
  title: "Conditions générales de vente | AJ Luxury",
};

export default function TermsPage() {
  return (
    <InfoPage
      eyebrow={<T id="info.terms.eyebrow" values={{ version: LEGAL_VERSION_DISPLAY }} />}
      title={<T id="info.terms.title" />}
      status={<T id="info.terms.status" />}
      officialFrenchOnly
    >
      <InfoNotice warning>
        <p>
          <strong>Prévisualisation sans vente.</strong> Aucun paiement ni aucune
          commande réelle ne sont actuellement acceptés sur ce site. Les
          présentes CGV définissent le cadre prévu pour l’ouverture de la
          boutique, sous réserve de compléter l’identité du vendeur, la
          logistique, le paiement et le médiateur.
        </p>
      </InfoNotice>

      <section>
        <h2>1. Vendeur et champ d’application</h2>
        <p>
          Les présentes conditions régissent les ventes à distance de produits
          AJ Luxury conclues avec des consommateurs sur le site. Le vendeur est{" "}
          <strong>{SELLER_IDENTITY.legalName}</strong>, dont le siège est situé{" "}
          <strong>{SELLER_IDENTITY.registeredOffice}</strong>.
        </p>
        <p>
          Le client déclare être majeur et disposer de la capacité juridique
          nécessaire. Toute commande implique l’acceptation des CGV en vigueur
          au moment de sa validation. Elles peuvent être conservées ou
          imprimées et seront jointes à la confirmation de commande sur un
          support durable.
        </p>
      </section>

      <section>
        <h2>2. Produits et disponibilité</h2>
        <p>
          Les caractéristiques essentielles, la composition, les tailles, les
          coloris et le prix figurent sur chaque fiche produit. Les photographies
          sont présentées avec le plus grand soin mais ne peuvent garantir une
          restitution parfaitement identique des couleurs selon les écrans.
        </p>
        <p>
          Les offres restent valables tant qu’elles sont visibles et disponibles.
          En cas d’indisponibilité après commande, le client en est informé sans
          délai et remboursé des sommes versées.
        </p>
      </section>

      <section>
        <h2>3. Prix</h2>
        <p>
          Les prix sont indiqués en euros. La mention fiscale exacte sera
          publiée après confirmation du régime de TVA du vendeur et, pour les
          ventes dans l’Union européenne, des règles applicables aux ventes à
          distance. Les frais de livraison sont indiqués séparément avant la
          validation de la commande. Le prix total exigible est celui affiché
          dans le récapitulatif final.
        </p>
        <p>
          Aucun paiement public n’est activé tant que cette qualification
          fiscale et son traitement dans la commande ne sont pas validés.
        </p>
      </section>

      <section>
        <h2>4. Commande</h2>
        <ol>
          <li>sélection du produit, du coloris et de la taille ;</li>
          <li>vérification du panier et correction des éventuelles erreurs ;</li>
          <li>saisie des informations de livraison et de facturation ;</li>
          <li>choix de la livraison et du paiement ;</li>
          <li>acceptation des CGV puis validation avec obligation de paiement.</li>
        </ol>
        <p>
          La vente devient définitive après autorisation du paiement et envoi de
          la confirmation de commande. AJ Luxury peut refuser une commande
          anormale, frauduleuse, incomplète ou liée à un litige de paiement
          antérieur, en motivant sa décision lorsque la loi l’exige.
        </p>
      </section>

      <section>
        <h2>5. Paiement</h2>
        <p>
          Les moyens de paiement disponibles seront affichés au moment de la
          commande. Le débit intervient selon les modalités du prestataire
          sélectionné. AJ Luxury ne conserve pas le cryptogramme de la carte.
          Les produits demeurent la propriété du vendeur jusqu’au paiement
          intégral, sans préjudice du transfert des risques prévu ci-dessous.
        </p>
      </section>

      <section>
        <h2>6. Livraison</h2>
        <p>
          Le lancement couvre la France métropolitaine, Corse comprise, et les
          autres pays de l’Union européenne pour lesquels un tarif réel est
          retourné avant paiement. Les destinations hors Union européenne et
          les territoires spéciaux restent fermés. Le transporteur, le tarif et
          le délai estimé sont présentés avant paiement. À défaut de date ou de
          délai convenu, la livraison intervient au plus tard trente jours après
          la commande.
        </p>
        <p>
          Le risque de perte ou d’endommagement est transféré au client lorsqu’il
          prend physiquement possession du colis, sauf s’il choisit lui-même un
          transporteur non proposé par AJ Luxury. Le client doit signaler
          rapidement tout colis endommagé ou incomplet, sans que cela limite ses
          garanties légales.
        </p>
      </section>

      <section>
        <h2>7. Droit de rétractation</h2>
        <p>
          Le client dispose de <strong>quatorze jours calendaires</strong> à
          compter de la réception du produit pour notifier sa décision, sans
          justification. Il peut utiliser le modèle ci-dessous ou adresser toute
          déclaration dénuée d’ambiguïté à{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>.
          Un accusé de réception lui est adressé sur un support durable.
        </p>
        <p>
          Le produit doit être renvoyé au plus tard quatorze jours après la
          notification. Les frais directs de retour sont à la charge du client,
          sauf erreur d’AJ Luxury, défaut ou non-conformité. L’adresse et les
          instructions de retour seront communiquées dans la confirmation de
          commande et lors de la demande.
        </p>
        <p>
          AJ Luxury rembourse les sommes reçues, y compris les frais de livraison
          standard initiaux, dans les quatorze jours suivant la notification. Le
          remboursement peut être différé jusqu’à la récupération du produit ou
          la réception d’une preuve d’expédition, la première date étant retenue.
        </p>
      </section>

      <section>
        <h2>8. Sous-vêtements et essayage</h2>
        <p>
          AJ Luxury n’exclut pas le droit de rétractation au seul motif que le
          produit est un sous-vêtement. Le client peut l’examiner comme il le
          ferait en magasin, sans le porter au-delà de ce qui est nécessaire
          pour vérifier sa nature, ses caractéristiques et sa taille.
        </p>
        <p>
          Une manipulation allant au-delà de cet examen peut uniquement donner
          lieu à une dépréciation justifiée. Cette règle ne prive jamais le
          client de la garantie légale en cas de défaut ou de non-conformité.
        </p>
      </section>

      <section>
        <h2>9. Garanties légales</h2>
        <InfoNotice>
          <p>
            <strong>
              Encadré réglementaire relatif aux garanties légales
            </strong>
          </p>
          <p>
            Le consommateur dispose d’un délai de deux ans à compter de la
            délivrance du bien pour obtenir la mise en œuvre de la garantie
            légale de conformité en cas d’apparition d’un défaut de conformité.
            Durant ce délai, il n’est tenu d’établir que l’existence du défaut
            et non sa date d’apparition.
          </p>
          <p>
            La garantie légale donne droit à la réparation ou au remplacement
            du bien dans les trente jours suivant la demande, sans frais et sans
            inconvénient majeur. Si le bien est réparé, la garantie initiale est
            prolongée de six mois. Si le consommateur demande la réparation mais
            que le vendeur impose le remplacement, la garantie est renouvelée
            pour deux ans à compter du remplacement.
          </p>
          <p>
            Le consommateur peut conserver le bien avec une réduction du prix ou
            mettre fin au contrat contre restitution si le professionnel refuse
            la réparation ou le remplacement, dépasse trente jours, occasionne
            un inconvénient majeur, ou si la non-conformité persiste. Il peut le
            faire immédiatement lorsque le défaut est suffisamment grave. La
            résolution n’est pas ouverte pour un défaut mineur.
          </p>
          <p>
            Toute période d’immobilisation suspend la garantie restant à courir.
            Ces droits résultent des articles L. 217-1 à L. 217-32 du Code de la
            consommation. Le vendeur faisant obstacle de mauvaise foi à leur
            mise en œuvre encourt l’amende civile prévue à l’article L. 241-5.
          </p>
          <p>
            Le consommateur bénéficie également de la garantie des vices cachés
            des articles 1641 à 1649 du Code civil pendant deux ans à compter de
            la découverte du défaut. Il peut conserver le bien avec une réduction
            du prix ou obtenir un remboursement intégral contre restitution.
          </p>
        </InfoNotice>
        <p>
          Toute demande est adressée à{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a> avec
          le numéro de commande, une description du problème et les éléments
          permettant de l’examiner.
        </p>
      </section>

      <section>
        <h2>10. Responsabilité et force majeure</h2>
        <p>
          AJ Luxury répond de la bonne exécution de ses obligations dans les
          limites prévues par la loi. Sa responsabilité ne peut être exclue pour
          les garanties légales, les dommages corporels, la faute lourde ou
          toute autre responsabilité que la loi interdit de limiter.
        </p>
        <p>
          Aucune partie n’est responsable d’un retard ou d’une inexécution causée
          par un événement de force majeure au sens de l’article 1218 du Code
          civil. La partie concernée informe l’autre et limite les conséquences
          de l’événement.
        </p>
      </section>

      <section>
        <h2>11. Données personnelles et propriété intellectuelle</h2>
        <p>
          Les traitements de données sont décrits dans la{" "}
          <a href="/privacy">politique de confidentialité</a> et les technologies
          de stockage dans la <a href="/cookies">politique cookies</a>. Les
          marques, logos, photographies, vidéos, textes et créations du site sont
          protégés ; leur reproduction sans autorisation est interdite.
        </p>
      </section>

      <section>
        <h2>12. Réclamations, médiation et droit applicable</h2>
        <p>
          Toute réclamation doit d’abord être adressée à{" "}
          <a href={`mailto:${LEGAL_CONTACT.email}`}>{LEGAL_CONTACT.email}</a>.
          Après une démarche écrite préalable restée sans solution, le
          consommateur peut saisir gratuitement un médiateur de la
          consommation.{" "}
          {/* Voir MEDIATOR dans lib/legal.ts : tant qu'aucun médiateur n'est
              conventionné, la page dit l'échéance plutôt que d'afficher des
              « À compléter » sur des conditions générales de vente. */}
          {MEDIATOR ? (
            <>
              Le médiateur conventionné par AJ Luxury est{" "}
              <strong>{MEDIATOR.name}</strong>, {MEDIATOR.address},{" "}
              {MEDIATOR.website}.
            </>
          ) : (
            <>
              Le médiateur conventionné par AJ Luxury sera désigné avant
              l’ouverture des ventes et ses coordonnées seront publiées ici.
            </>
          )}
        </p>
        <p>
          Les CGV sont soumises au droit français, sans priver le consommateur
          résidant dans un autre pays européen des dispositions impératives plus
          protectrices de son pays. À défaut d’accord amiable, les juridictions
          compétentes sont déterminées par les règles légales applicables aux
          consommateurs.
        </p>
      </section>

      <section>
        <h2>13. Modèle de formulaire de rétractation</h2>
        <p>
          À adresser uniquement si le client souhaite se rétracter du contrat :
        </p>
        <p>
          À l’attention d’AJ Luxury, {SELLER_IDENTITY.registeredOffice},{" "}
          {LEGAL_CONTACT.email} : « Je vous notifie par la présente ma
          rétractation du contrat portant sur la vente du bien suivant :
          [produit]. Commandé le [date] et reçu le [date]. Numéro de commande :
          [numéro]. Nom et adresse du client : [à compléter]. Date et signature,
          uniquement en cas d’envoi papier. »
        </p>
      </section>
    </InfoPage>
  );
}
