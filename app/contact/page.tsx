import InfoPage from "../components/InfoPage";

export const metadata = { title: "Contact | AJ Luxury" };

export default function ContactPage() {
  return (
    <InfoPage eyebrow="AJ Luxury" title="Nous contacter.">
      <p>
        L’adresse de contact et les horaires de réponse seront ajoutés après
        validation par AJ Luxury.
      </p>
      <p>
        Le formulaire de contact sera connecté uniquement lorsque sa
        destination et les règles de traitement des demandes auront été
        définies.
      </p>
    </InfoPage>
  );
}
