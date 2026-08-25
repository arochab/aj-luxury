import PageIntrouvable from "../../components/PageIntrouvable";

/* Le `notFound()` levé par la fiche quand le coloris n'existe pas. Sans ce
   fichier, vinext rend « Not Found » en 9 octets au lieu de la page. */
export default function NotFound() {
  return <PageIntrouvable />;
}
