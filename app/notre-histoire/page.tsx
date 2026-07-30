import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
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
          <div className={styles.heroCopy} lang="fr">
            <p className={styles.eyebrow}>AJ Luxury</p>
            <h1 id="story-title">Notre histoire</h1>
            <blockquote>
              Le véritable luxe commence par ce que l’on porte au plus près de soi.
            </blockquote>
          </div>

          <figure className={styles.heroImage}>
            <Image
              unoptimized
              priority
              src="/images/client/campaign-duo-lilas-seated.webp"
              alt="Jérémy et Alex portant Apollon Lilas Céleste"
              fill
              sizes="(max-width: 760px) 100vw, 62vw"
            />
          </figure>
        </div>
      </section>

      <section className={styles.origin} aria-labelledby="origin-title" lang="fr">
        <div className={styles.actHeading}>
          <p className={styles.actIndex}>01</p>
          <h2 id="origin-title">Le point de départ</h2>
        </div>

        <div className={styles.originCopy}>
          <p>
            Tout est parti d’un constat simple : les sous-vêtements sont souvent
            considérés comme un simple basique, alors qu’ils sont le premier
            vêtement que l’on enfile chaque matin. Pourtant, ils influencent
            notre confort, notre assurance et notre bien-être tout au long de la
            journée.
          </p>
          <p>C’est de cette conviction qu’est née AJ Luxury.</p>
        </div>
      </section>

      <section className={styles.people} aria-labelledby="people-title" lang="fr">
        <div className={styles.peopleHeader}>
          <div className={styles.actHeading}>
            <p className={styles.actIndex}>02</p>
            <h2 id="people-title">Jérémy &amp; Alex</h2>
          </div>
          <p className={styles.peopleStatement}>
            Jérémy et Alex sont les cofondateurs d’AJ Luxury et les deux visages
            de la première campagne.
          </p>
        </div>

        <div className={styles.portraitGrid}>
          <figure className={styles.portrait}>
            <Image
              unoptimized
              src="/images/client/editorial-rose-jeremy.webp"
              alt="Jérémy portant Apollon Rose Velours"
              fill
              sizes="(max-width: 760px) 50vw, 44vw"
            />
            <figcaption>Jérémy</figcaption>
          </figure>

          <figure className={styles.portrait}>
            <Image
              unoptimized
              src="/images/client/product-rose-model.webp"
              alt="Alex portant Apollon Rose Velours"
              fill
              sizes="(max-width: 760px) 50vw, 44vw"
            />
            <figcaption>Alex</figcaption>
          </figure>
        </div>
      </section>

      <section
        className={styles.definition}
        aria-labelledby="definition-title"
        lang="fr"
      >
        <div className={styles.definitionCopy}>
          <div className={styles.actHeading}>
            <p className={styles.actIndex}>03</p>
            <h2 id="definition-title">
              Pas d’excès. Simplement la justesse des détails.
            </h2>
          </div>

          <div className={styles.definitionText}>
            <p>
              Notre ambition est de réinventer cet essentiel du quotidien en
              créant des sous-vêtements qui allient élégance, confort et qualité,
              sans jamais faire de compromis.
            </p>
            <p>Le confort est une véritable source de confiance en soi.</p>
          </div>
        </div>

        <figure className={styles.definitionVisual}>
          <Image
            unoptimized
            src="/images/client/product-pourpre-detail.webp"
            alt="Détail du boxer Apollon Pourpre Impérial et de sa ceinture AJ Luxury"
            fill
            sizes="(max-width: 760px) 100vw, 40vw"
          />
        </figure>
      </section>

      <section className={styles.closing} aria-labelledby="closing-title">
        <h2 id="closing-title" lang="en">
          Reveal Your Inner Beauty
        </h2>
        <Link href="/shop">Découvrir la collection</Link>
      </section>

      <StoreFooter />
    </main>
  );
}
