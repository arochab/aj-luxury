import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import MetallicField from "../components/MetallicField";
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
        <StoreHeader />
        <div className={styles.heroMetal} aria-hidden="true">
          <MetallicField motion="slow" variant="dusk" />
        </div>
        <figure className={styles.heroImage}>
          <Image
            unoptimized
            priority
            src="/images/client/campaign-duo-pourpre.webp"
            alt="Les deux fondateurs d’AJ Luxury portant le modèle Apollon"
            fill
            sizes="(max-width: 760px) 100vw, 66vw"
          />
        </figure>
        <div className={styles.heroGrade} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>AJ Luxury</p>
          <h1 id="story-title">Notre histoire</h1>
          <blockquote>
            Le véritable luxe commence par ce que l’on porte au plus près de soi.
          </blockquote>
        </div>
      </section>

      <section className={styles.origin} aria-labelledby="origin-title">
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

      <section className={styles.founders} aria-labelledby="founders-title">
        <figure className={styles.foundersVisual}>
          <Image
            unoptimized
            src="/images/client/campaign-duo-lilas-close.webp"
            alt="Les deux fondateurs et mannequins AJ Luxury"
            fill
            sizes="(max-width: 760px) 100vw, 60vw"
          />
        </figure>
        <div className={styles.foundersCopy}>
          <p className={styles.sectionNumber}>02 · Une vision incarnée</p>
          <h2 id="founders-title">Portée par ceux qui la construisent.</h2>
          <p>
            Les fondateurs d’AJ Luxury apparaissent eux-mêmes dans les premières
            images de la maison. Un choix volontaire : donner un visage réel au
            projet et présenter le produit sur deux silhouettes différentes,
            sans le dissocier de ceux qui portent sa vision.
          </p>
          <p>
            Cette proximité guide la marque : observer le vêtement dans le
            mouvement, soigner sa présence et construire une identité masculine
            à la fois sobre, assumée et contemporaine.
          </p>
        </div>
      </section>

      <section className={styles.chapter} aria-labelledby="chapter-title">
        <div className={styles.chapterCopy}>
          <p className={styles.sectionNumber}>03 · Le premier chapitre</p>
          <h2 id="chapter-title">Apollon</h2>
          <p>
            Un boxer masculin conçu pour réunir douceur, respirabilité, maintien
            et liberté de mouvement, sans renoncer à une finition distinctive.
          </p>
          <dl className={styles.facts}>
            <div>
              <dt>Matière</dt>
              <dd>94 % modal · 6 % élasthanne</dd>
            </div>
            <div>
              <dt>Signature</dt>
              <dd>Ceinture premium de 3,5 cm et logo métallique</dd>
            </div>
            <div>
              <dt>Collection</dt>
              <dd>Trois coloris · tailles S à XL</dd>
            </div>
          </dl>
          <Link href="/shop">Découvrir Apollon</Link>
        </div>
        <figure className={styles.chapterVisual}>
          <Image
            unoptimized
            src="/images/client/product-pourpre-detail.webp"
            alt="Détail du boxer Apollon et de sa ceinture métallique AJ Luxury"
            fill
            sizes="(max-width: 760px) 100vw, 62vw"
          />
        </figure>
      </section>

      <section className={styles.definition} aria-labelledby="definition-title">
        <div className={styles.definitionCopy}>
          <p className={styles.sectionNumber}>04 · Notre définition du luxe</p>
          <h2 id="definition-title">
            Pas l’excès. La justesse des détails.
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
        <div className={styles.closingMetal} aria-hidden="true">
          <MetallicField motion="slow" variant="silver" />
        </div>
        <div className={styles.closingCopy}>
          <p>AJ Luxury</p>
          <h2 id="closing-title">Reveal Your Inner Beauty</h2>
          <Link href="/shop">Entrer dans la collection</Link>
        </div>
      </section>

      <StoreFooter />
    </main>
  );
}
