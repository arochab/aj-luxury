import InfoPage from "../components/InfoPage";

export const metadata = { title: "Livraison et retours | AJ Luxury" };

export default function ShippingReturnsPage() {
  return (
    <InfoPage eyebrow="Service client" title="Livraison et retours.">
      <p>
        Les zones desservies, les délais, les tarifs de livraison et la
        procédure de retour seront précisés avec AJ Luxury avant l’ouverture
        de la boutique.
      </p>
      <p>
        Cette page réserve dès maintenant l’emplacement attendu sur un site
        e-commerce, sans afficher de promesse commerciale encore non validée.
      </p>
    </InfoPage>
  );
}
