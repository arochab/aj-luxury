import InfoPage from "../components/InfoPage";

export const metadata = { title: "Confidentialité | AJ Luxury" };

export default function PrivacyPage() {
  return (
    <InfoPage eyebrow="Informations légales" title="Confidentialité.">
      <p>
        La politique de confidentialité sera finalisée lorsque les outils
        réellement utilisés pour les comptes, le paiement, la mesure
        d’audience et la newsletter auront été retenus.
      </p>
      <p>
        Aucun formulaire de cette maquette ne collecte ni ne transmet de
        données personnelles.
      </p>
    </InfoPage>
  );
}
