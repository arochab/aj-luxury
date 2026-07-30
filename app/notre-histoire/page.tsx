import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import styles from "./Story.module.css";

export const metadata: Metadata = {
  title: "Notre histoire | AJ Luxury",
  description:
    "Découvrez la vision d’AJ Luxury : réinventer le sous-vêtement masculin autour du confort, de la qualité et de la confiance en soi.",
};

export default function NotreHistoirePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="story-title">
        <div className={styles.heroTop}>
          <StoreHeader variant="light" />
        </div>
        <figure className={styles.heroImage}>
          <Image
            unoptimized
            priority
            src="/images/client/campaign-duo-lilas-close.webp"
            alt="Jérémy et Alex portant Apollon Lilas Céleste, produit visible"
            fill
            style={{ objectFit: "contain", objectPosition: "center bottom" }}
            sizes="(max-width: 760px) 100vw, 66vw"
          />
        </figure>
        <div className={styles.heroCopy} lang="fr">
          <p className={styles.eyebrow}>AJ Luxury</p>
          <h1 id="story-title">Notre histoire</h1>
          <blockquote>
            Le véritable luxe commence par ce que l’on porte au plus près de soi.
          </blockquote>
        </div>
      </section>

      <section className={styles.origin} aria-labelledby="origin-title" lang="fr">
        <div>
          <p className={styles.sectionNumber}>01 · Le point de départ</p>
          <h2 className={styles.originLead} id="origin-title">
            Repenser le premier vêtement de la journée.
          </h2>
        </div>
        <div className={styles.originText}>
          <p>
            Tout est parti d’un constat simple : les sous-vêtements sont souvent
            considérés comme un basique, alors qu’ils sont le premier vêtement
            que l’on enfile chaque matin et celui qui nous accompagne au plus
            près, tout au long de la journée.
          </p>
          <p>
            Leur coupe, leur matière et leur maintien influencent directement
            notre confort, notre assurance et notre liberté de mouvement. C’est
            de cette conviction qu’est née AJ Luxury : donner à cet essentiel
            l’attention qu’il mérite.
          </p>
        </div>
      </section>

      <section className={styles.founders} aria-labelledby="founders-title" lang="fr">
        <figure className={styles.foundersVisual}>
          <Image
            unoptimized
            src="/images/client/product-rose-model.webp"
            alt="Jérémy portant Apollon Rose Velours, silhouette et produit visibles"
            fill
            sizes="(max-width: 760px) 100vw, 60vw"
          />
        </figure>
        <div className={styles.foundersCopy}>
          <p className={styles.sectionNumber}>02 · Une vision incarnée</p>
          <h2 id="founders-title">Portée par ceux qui la construisent.</h2>
          <p>
            Ce bloc pose une intention d’image : montrer le produit porté, dans
            des attitudes naturelles, sans enfermer AJ Luxury dans un casting ou
            une mise en scène unique. Les visuels actuels servent de point de
            départ à un langage sobre, incarné et centré sur le vêtement.
          </p>
          <p>
            À mesure que la maison évoluera, de futurs shootings et
            collaborations pourront élargir les silhouettes, les regards et les
            contextes. Cette ouverture permettra d’enrichir l’univers de la
            marque tout en conservant une même exigence de coupe, de présence et
            de justesse.
          </p>
        </div>
      </section>

      <section className={styles.definition} aria-labelledby="definition-title" lang="fr">
        <div className={styles.definitionCopy}>
          <p className={styles.sectionNumber}>03 · Notre définition du luxe</p>
          <h2 id="definition-title">
            Pas d’excès. Simplement la justesse des détails.
          </h2>
        </div>
        <div className={styles.definitionText}>
          <p>
            Pour AJ Luxury, le luxe se mesure à ce que l’on ressent : une coupe
            qui accompagne le corps, une matière agréable du matin au soir et
            des finitions pensées pour durer.
          </p>
          <p>
            Notre ambition est de créer des sous-vêtements modernes, épurés et
            intemporels, capables d’associer confort, élégance et confiance en
            soi sans jamais en faire trop.
          </p>
        </div>
      </section>

      <section className={styles.closing} aria-labelledby="closing-title">
        <div className={styles.closingCopy}>
          <Image
            unoptimized
            className={styles.closingLogo}
            src="/images/aj-luxury-logo.webp"
            alt="AJ Luxury"
            width={280}
            height={202}
          />
          <h2 id="closing-title">Reveal Your Inner Beauty</h2>
          <Link href="/shop">Entrer dans la collection</Link>
          <div className={styles.closingContacts} aria-label="Contacts AJ Luxury">
            <a href="mailto:contact@ajluxurystore.com">
              contact@ajluxurystore.com
            </a>
            <span>Instagram · compte officiel à confirmer</span>
          </div>
        </div>
      </section>

      <StoreFooter />
    </main>
  );
}
