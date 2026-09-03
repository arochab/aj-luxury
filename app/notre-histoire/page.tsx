import type { Metadata } from "next";
import Image from "next/image";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";
import StoryHeroMedia from "./StoryHeroMedia";
import styles from "./Story.module.css";

export const metadata: Metadata = {
  title: "Notre histoire | AJ Luxury",
  description:
    "Le véritable luxe commence par ce que l’on porte au plus près de soi.",
};

export default function NotreHistoirePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="story-title">
        <div className={styles.heroTop}>
          <StoreHeader />
        </div>

        <div className={styles.heroBody}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>AJ Luxury</p>
            <h1 id="story-title">
              <T id="story.title" />
            </h1>
            <blockquote>
              <T id="story.quote" />
            </blockquote>
          </div>

          <StoryHeroMedia />
        </div>
      </section>

      <section className={styles.origin} aria-labelledby="origin-title">
        <div className={styles.actHeading}>
          <h2 id="origin-title">
            <T id="story.originTitle" />
          </h2>
        </div>

        <div className={styles.originCopy}>
          <p>
            <T id="story.originP1" />
          </p>
          <p>
            <T id="story.originP2" />
          </p>
        </div>
      </section>

      <section className={styles.people} aria-labelledby="people-title">
        <div className={styles.peopleHeader}>
          <div className={styles.actHeading}>
            <h2 id="people-title">Alex &amp; Jérémy</h2>
          </div>
          <p className={styles.peopleStatement}>
            <T id="story.peopleStatement" />
          </p>
        </div>

        <div className={styles.portraitGrid}>
          <figure className={styles.portrait}>
            <Image
              unoptimized
              alt="AJ Luxury — Alex — collection Apollon"
              src="/images/client/raw/product-lilas-model.webp"
              fill
              sizes="(max-width: 760px) 50vw, 44vw"
              style={{ objectFit: "contain", objectPosition: "center" }}
            />
            <figcaption>Alex</figcaption>
          </figure>

          <figure className={styles.portrait}>
            <Image
              unoptimized
              alt="AJ Luxury — Jérémy — collection Apollon"
              src="/images/client/story-jeremy-retouched.jpeg"
              fill
              sizes="(max-width: 760px) 50vw, 44vw"
              style={{ objectFit: "contain", objectPosition: "center" }}
            />
            <figcaption>Jérémy</figcaption>
          </figure>
        </div>
      </section>

      <section
        className={styles.definition}
        aria-labelledby="definition-title"
      >
        <div className={styles.definitionCopy}>
          <div className={styles.actHeading}>
            <h2 id="definition-title">
              <T id="story.definitionTitle" />
            </h2>
          </div>

          <div className={styles.definitionText}>
            <p>
              <T id="story.definitionP1" />
            </p>
            <p>
              <T id="story.definitionP2" />
            </p>
          </div>
        </div>

        <figure className={styles.definitionVisual}>
          <Image
            unoptimized
            src="/images/client/product-pourpre-detail.webp"
            alt="AJ Luxury — détail du modèle Apollon"
            fill
            sizes="(max-width: 760px) 100vw, 40vw"
          />
        </figure>
      </section>

      <StoreFooter />
    </main>
  );
}
