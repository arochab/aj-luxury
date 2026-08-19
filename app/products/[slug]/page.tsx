/* eslint-disable @next/next/no-img-element -- pre-optimized client-owned media avoids an unnecessary image runtime */

import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductGalleryZoom, {
  AjScrollReveal,
} from "../../components/ProductGalleryZoom";
import ProductPurchase from "../../components/ProductPurchase";
import LocalizedPrice from "../../components/LocalizedPrice";
import StoreFooter from "../../components/StoreFooter";
import StoreHeader from "../../components/StoreHeader";
import styles from "../../components/ProductPage.module.css";
import { getPublicStockBySize } from "../../../lib/commerce/internal-stock";
import type { PublicStockBySize } from "../../../lib/commerce/public-stock";
import { getProduct, getProducts } from "../../../lib/products";
import { T } from "../../../lib/i18n/TranslatedText";
import { getServerCommerceRuntimeMode } from "../../../lib/commerce/commerce-runtime.server";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return getProducts().map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);

  if (!product) return {};

  return {
    title: `${product.model} ${product.name} | AJ Luxury`,
    description: `${product.model}, coloris ${product.name}, 94% modal et 6% élasthanne.`,
    robots: { index: false, follow: false },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = getProduct(slug);
  const products = getProducts();

  if (!product) notFound();

  /* La disponibilité par taille est résolue ICI, sur le serveur, et descend en
     props initiales : l'acheteur voit l'état de chaque taille au premier rendu,
     jamais après montage. `null` n'existe qu'en cas d'échec de résolution —
     c'est le seul cas où le panneau retombe sur « vérifié à l'ajout ». */
  let availability: PublicStockBySize | null = null;
  try {
    availability = getPublicStockBySize(product.slug);
  } catch {
    availability = null;
  }
  const runtimeMode = getServerCommerceRuntimeMode();
  const otherProducts = products.filter((item) => item.slug !== product.slug);

  return (
    <main
      className={styles.page}
      /* L'accent du coloris courant descend du swatch produit et sert au
         filet actif du panneau d'achat. Jamais une couleur inventée. */
      style={{ "--pdp-accent": product.swatch } as CSSProperties}
    >
      <StoreHeader />

      {/* display:contents — la scène n'est qu'une portée de sélecteurs GSAP. */}
      <AjScrollReveal className={styles.scene}>
        {/*
          Le fil d'Ariane porte quatre paliers depuis le 19/08, et non trois.
          Deux raisons, toutes deux issues des retours d'Adam :
          — le libellé « Collection » ouvrait /shop, dont le titre est
            « Apollon » : l'étiquette contredisait sa destination. Elle devient
            « Boutique », qui est bien la page visée ;
          — il n'existait aucun palier « Apollon ». Le modèle est maintenant un
            niveau à part entière, entre la boutique et le coloris. C'est la
            façon la moins chère et la plus honnête de montrer qu'Apollon est
            UN modèle et non LE catalogue : l'emplacement d'un futur modèle
            frère existe visuellement, sans qu'une seule promesse commerciale
            soit écrite.
          Le palier du modèle n'est pas un lien : il n'a pas encore de page à
          lui, et un second lien vers /shop dans le même fil serait un leurre.
        */}
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/"><T id="nav.home" /></Link>
          <span aria-hidden="true">/</span>
          <Link href="/shop"><T id="nav.shop" /></Link>
          <span aria-hidden="true">/</span>
          <span>{product.model}</span>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{product.name}</span>
        </nav>

        <section className={styles.hero}>
          <ProductGalleryZoom
            images={product.gallery}
            model={product.model}
            color={product.name}
          />

          <ProductPurchase
            product={product}
            products={products}
            availability={availability}
            runtimeMode={runtimeMode}
          />
        </section>

        <section
          className={styles.otherColors}
          aria-labelledby="autres-coloris"
        >
          <div className={styles.otherColorsHeader} data-aj-reveal>
            <p className={styles.eyebrow}><T id="shop.title" /></p>
            <h2 id="autres-coloris"><T id="common.discoverAlso" /></h2>
          </div>

          <div className={styles.otherColorsGrid}>
            {otherProducts.map((item) => (
              <Link
                className={styles.otherColor}
                href={`/products/${item.slug}`}
                key={item.slug}
                data-aj-reveal
                style={{ "--pdp-accent": item.swatch } as CSSProperties}
              >
                {/* LE PLATEAU, PAS LE CORPS — retour n°4, 19/08.
                    Deux coloris sur trois sont portés par Alex : sur la fiche
                    du troisième, les deux recommandations montraient donc
                    fatalement deux fois le même homme. C'était le cas mesuré
                    sur /products/lilas-bleu-clair, et sur /products/pourpre la
                    paire allait jusqu'à deux Jérémy décapités par le cadre.
                    Aucun réordonnancement ne pouvait le résoudre : le défaut
                    est arithmétique, deux hommes pour trois coloris.
                    On montre donc la NATURE MORTE du coloris — marbre, lyre,
                    arc, laurier, carquois — qui ne porte aucun corps, ne pose
                    aucune question de parité, ne coupe aucun visage, et dit la
                    couleur mieux qu'un buste recadré. C'est aussi le plan
                    « Seul » que la séquence guidée de l'accueil a déjà appris
                    à lire. Ratio natif 1024x1536, soit exactement le 2/3 du
                    cadre : aucun rognage. */}
                <span className={styles.otherColorImage}>
                  <span className={styles.otherColorMedia}>
                    <img
                      src={item.still}
                      alt={`${item.model} ${item.name} — le plateau`}
                      width={1024}
                      height={1536}
                      loading="lazy"
                      fetchPriority="low"
                      decoding="async"
                      sizes="(max-width: 760px) 100vw, 33vw"
                    />
                  </span>
                  <span className={styles.otherColorFilet} aria-hidden="true" />
                </span>

                <span className={styles.otherColorLine}>
                  <span className={`${styles.otherColorName} aj-metal`}>
                    {item.name}
                  </span>
                  <span className={styles.otherColorPrice}>
                    <LocalizedPrice amountCents={item.priceCents} />
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </AjScrollReveal>

      <StoreFooter />
    </main>
  );
}
