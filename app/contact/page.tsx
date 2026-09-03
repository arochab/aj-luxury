import InfoPage from "../components/InfoPage";
import { T } from "../../lib/i18n/TranslatedText";
import { LEGAL_CONTACT } from "../../lib/legal";
import styles from "../components/InfoPage.module.css";

export const metadata = { title: "Contact | AJ Luxury" };

export default function ContactPage() {
  return (
    <InfoPage
      eyebrow="AJ Luxury"
      title={<T id="contact.title" />}
      /* La page publique ne doit jamais exposer de consigne interne de recette. */
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
          href={`mailto:${LEGAL_CONTACT.email}`}
        >
          {LEGAL_CONTACT.email}
        </a>
      </p>

      <p>
        <T id="contact.responseTime" />
      </p>

      <p>
        <T id="contact.scope" />
      </p>

      <p>
        <T id="contact.storeStatus" />
      </p>
    </InfoPage>
  );
}
