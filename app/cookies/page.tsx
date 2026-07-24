import InfoPage from "../components/InfoPage";

export const metadata = { title: "Cookies | AJ Luxury" };

export default function CookiesPage() {
  return (
    <InfoPage eyebrow="Confidentialité" title="Cookies.">
      <p>
        Les cookies nécessaires et les éventuels outils de mesure seront
        documentés lorsque l’hébergement, l’e-commerce et la mesure d’audience
        auront été retenus.
      </p>
      <p>
        Aucun outil publicitaire ou de suivi n’est activé dans cette maquette.
      </p>
    </InfoPage>
  );
}
