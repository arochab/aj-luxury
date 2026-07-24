import InfoPage from "../components/InfoPage";

export const metadata = { title: "Conditions générales | AJ Luxury" };

export default function TermsPage() {
  return (
    <InfoPage eyebrow="Informations légales" title="Conditions générales.">
      <p>
        Les conditions générales de vente seront rédigées et validées avant
        l’activation du paiement, à partir du périmètre commercial, logistique
        et juridique retenu par AJ Luxury.
      </p>
      <p>
        Les prix, taxes, moyens de paiement, délais et conditions de retour
        visibles dans la version finale devront correspondre à ces règles.
      </p>
    </InfoPage>
  );
}
