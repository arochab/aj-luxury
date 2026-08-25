import InfoPage from "../components/InfoPage";
import { T } from "../../lib/i18n/TranslatedText";
import styles from "../components/InfoPage.module.css";

export const metadata = { title: "Contact | AJ Luxury" };

export default function ContactPage() {
  return (
    <InfoPage
      eyebrow="AJ Luxury"
      title={<T id="contact.title" />}
      /*
        `status` par défaut affichait « Contenu à valider avant mise en ligne »,
        une consigne de production interne, rendue au visiteur juste sous la
        seule information utile de la page. Sur une préversion montrée au
        client, cela se lit comme un aveu d'inachèvement à l'endroit précis où
        l'on demande à quelqu'un de nous écrire. L'état réel est dit plus bas,
        avec le même vocabulaire que /cart et /checkout : une démonstration, pas
        un chantier.
      */
      status={null}
    >
      {/*
        L'adresse était un lien en ligne de 201,3 x 22,4 px : la moitié du
        plancher de 44 px, pour la seule action de la page. Ce n'est pas un
        renvoi inséré dans une phrase — l'exemption WCAG 2.5.8 ne s'y applique
        pas — c'est le bouton de contact du site. La phrase reste intacte, seule
        la cible change de nature.
      */}
      <p>
        <T id="contact.writeToUs" />{" "}
        <a
          className={styles.actionMail}
          href="mailto:contact@ajluxurystore.com"
        >
          contact@ajluxurystore.com
        </a>
      </p>

      <p>
        <T id="contact.responseTime" />
      </p>

      <p>
        <T id="contact.scope" />
      </p>

      <p>
        <T id="contact.demoNotice" />
      </p>
    </InfoPage>
  );
}
