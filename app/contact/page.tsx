import InfoPage from "../components/InfoPage";
import { T } from "../../lib/i18n/TranslatedText";

export const metadata = { title: "Contact | AJ Luxury" };

export default function ContactPage() {
  return (
    <InfoPage eyebrow="AJ Luxury" title={<T id="contact.title" />}>
      <p>
        <T id="contact.writeToUs" />{" "}
        <a href="mailto:contact@ajluxurystore.com">
          contact@ajluxurystore.com
        </a>
      </p>
      <p>
        <T id="contact.instagramPending" />
      </p>
    </InfoPage>
  );
}
