import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";
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
          <StoreHeader variant="light" />
        </div>

        <div className={styles.heroBody}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>AJ Luxury</p>
            <h1 id="story-title"><T id="story.title" /></h1>
            <blockquote>
              <T id="story.quote" />
            </blockquote>
          </div>

          <figure className={styles.heroImage}>
            <Image
              unoptimized
              priority
              src="/images/client/campaign-duo-lilas-seated.webp"
              alt="AJ Luxury — Jérémy, Alex — Apollon Lilas Céleste"
              fill
              sizes="(max-width: 760px) 100vw, 62vw"
            />
          </figure>
        </div>
      </section>

      <section className={styles.origin} aria-labelledby="origin-title">
        <div className={styles.actHeading}>
          <p className={styles.actIndex}>01</p>
          <h2 id="origin-title"><T id="story.originTitle" /></h2>
        </div>

        <div className={styles.originCopy}>
          <p><T id="story.originP1" /></p>
          <p><T id="story.originP2" /></p>
        </div>
      </section>

      <section className={styles.people} aria-labelledby="people-title">
        <div className={styles.peopleHeader}>
          <div className={styles.actHeading}>
            <p className={styles.actIndex}>02</p>
            <h2 id="people-title">Alex &amp; Jérémy</h2>
          </div>
          <p className={styles.peopleStatement}><T id="story.peopleStatement" /></p>
        </div>

        <div className={styles.portraitGrid}>
          <figure className={styles.portrait}>
            <Image
              unoptimized
              src="/images/client/product-lilas-model.webp"
              alt="AJ Luxury — Alex — Apollon Lilas Céleste"
              fill
              sizes="(max-width: 760px) 50vw, 44vw"
            />
            <figcaption>Alex</figcaption>
          </figure>

          <figure className={styles.portrait}>
            <Image
              unoptimized
              src="/images/client/story-jeremy-retouched.jpeg"
              alt="AJ Luxury — Jérémy — Apollon Rose Velours"
              fill
              sizes="(max-width: 760px) 50vw, 44vw"
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
            <p className={styles.actIndex}>03</p>
            <h2 id="definition-title">
              <T id="story.definitionTitle" />
            </h2>
          </div>

          <div className={styles.definitionText}>
            <p><T id="story.definitionP1" /></p>
            <p><T id="story.definitionP2" /></p>
          </div>
        </div>

        <figure className={styles.definitionVisual}>
          <Image
            unoptimized
            src="/images/client/product-pourpre-detail.webp"
            alt="AJ Luxury — Apollon Pourpre Impérial"
            fill
            sizes="(max-width: 760px) 100vw, 40vw"
          />
        </figure>
      </section>

      <section className={styles.closing} aria-labelledby="closing-title">
        <h2 id="closing-title" lang="en">
          Reveal Your Inner Beauty
        </h2>
        <Link href="/shop"><T id="story.discoverCollection" /></Link>
      </section>

      <StoreFooter />
    </main>
  );
}
