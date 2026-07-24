import InfoPage from "../components/InfoPage";

export const metadata = { title: "Mentions légales | AJ Luxury" };

export default function LegalNoticePage() {
  return (
    <InfoPage eyebrow="Informations légales" title="Mentions légales.">
      <p>
        L’identité complète de l’éditeur, son adresse, ses coordonnées, son
        statut juridique et les informations de l’hébergeur seront renseignés
        après validation par AJ Luxury.
      </p>
      <p>
        Cette maquette ne doit pas être publiée comme boutique active avant
        l’ajout et la validation de ces informations.
      </p>
    </InfoPage>
  );
}
