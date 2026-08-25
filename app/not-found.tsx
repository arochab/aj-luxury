import PageIntrouvable from "./components/PageIntrouvable";

/* Les routes non reconnues. Le contenu vit dans le composant partagé : voir
   la note qui s'y trouve pour la raison d'être des deux fichiers. */
export default function NotFound() {
  return <PageIntrouvable />;
}
