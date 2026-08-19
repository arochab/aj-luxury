import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { getProducts, sizes } from "../../lib/products";
import { getServerCommerceRuntimeMode } from "../../lib/commerce/commerce-runtime.server";
import LocalizedPrice from "../components/LocalizedPrice";
import LocalizedProductText from "../components/LocalizedProductText";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { AjScrollReveal } from "../components/ProductGalleryZoom";
import { T } from "../../lib/i18n/TranslatedText";
import styles from "../components/Boutique.module.css";

export const metadata: Metadata = {
  title: "Boutique | AJ Luxury",
  description:
    "Apollon, premier modèle AJ Luxury, décliné en Rose Velours, Lilas Céleste et Pourpre Impérial.",
};

/*
 * L'image de la matière est la même que celle de #matiere sur la maquette :
 * la ceinture 3,5 cm et sa plaque métal. Chemin vérifié dans public/ — aucun
 * actif n'est inventé ici.
 */
const MATIERE_IMAGE = "/images/client/product-pourpre-detail.webp";

export default function ShopPage() {
  const products = getProducts();
  const runtimeMode = getServerCommerceRuntimeMode();
  const prixCents = products[0]?.priceCents ?? null;

  return (
    <main className={styles.boutique}>
      <StoreHeader />

      {/*
        AjScrollReveal est en display:contents — il ne sert que de portée aux
        sélecteurs GSAP. Les blocs marqués data-aj-reveal sont révélés par
        ScrollTrigger.batch, ceux marqués data-aj-para reçoivent la parallaxe.
      */}
      <AjScrollReveal className={styles.scene}>
        <section className={styles.ouverture} aria-labelledby="boutique-titre">
          {/*
            RETOUR ADAM DU 19/08 — « le site donne l'impression qu'il n'y aura
            JAMAIS qu'un produit ». La boutique était le mécanisme exact du
            problème : eyebrow « BOUTIQUE · LA COLLECTION » puis titre
            « Apollon », donc aucun niveau où un deuxième modèle pourrait un
            jour s'inscrire. L'eyebrow nomme maintenant le rang d'Apollon —
            premier modèle — et le chapô le dit en toutes lettres.
            Le mot « premier » fait tout le travail : il est vrai aujourd'hui,
            il ne promet aucune date et il n'annonce aucune disponibilité.
            Aucune formulation du site ne laisse entendre qu'un autre modèle
            serait déjà achetable.
          */}
          <p className={styles.eyebrow} data-aj-reveal>
            <T id="nav.shop" /> · <T id="shop.firstModel" />
          </p>

          <h1
            className={`${styles.titre} aj-metal`}
            id="boutique-titre"
            data-aj-reveal
          >
            Apollon
          </h1>

          <p className={styles.chapo} data-aj-reveal>
            <T id="shop.intro" />
          </p>

          {/*
            RETOUR ADAM DU 19/08 — « la boutique est encore trop sombre et mal
            foutue ».

            « MAL FOUTUE », PREMIER MÉCANISME : la page ouvrait sur une fiche
            technique. Le bandeau de quatre colonnes APOLLON / COLORIS /
            TAILLES / COMPOSITION mesurait 117 px et repoussait la première
            photographie à y=592 dans un écran de 900. Le premier écran de la
            boutique ne montrait donc AUCUN produit : trois torses recadrés, un
            tableau de spécifications, et le boxer à 390 px sous la ligne de
            flottaison. Une boutique qui ne montre pas ce qu'elle vend.

            Les faits matière — coloris, tailles — descendent à la section
            « matière », dont la colonne de droite était vide à 82 % : un seul
            déplacement règle les deux défauts. Ne subsiste ici que ce qui
            décide d'entrer : le prix, et le statut commercial réel.
          */}
          <div className={styles.statut} data-aj-reveal>
            <p className={styles.prix}>
              <LocalizedPrice amountCents={prixCents} />
            </p>

            {/*
              « Prix fictif, non commercial » était affiché ici, en clair, sous
              le prix de la marque. Une boutique qui déclare ses propres prix
              faux détruit sa crédibilité en une ligne — et elle ne disait
              toujours pas l'essentiel : que la vente n'est pas encore ouverte.
              Une seule phrase remplace les deux, formulée comme une ouverture
              à venir et non comme un aveu de maquette. Elle ne promet aucune
              date et n'annonce aucune disponibilité.

              Aucun champ de collecte n'est posé ici : il n'existe ni endpoint
              d'inscription ni mention RGPD associée, et un formulaire inerte
              serait exactement le CTA qui promet une action qu'il ne rend pas.
              Le lien mène à la seule voie réellement ouverte aujourd'hui.
            */}
            {runtimeMode !== "production" && (
              <p className={styles.statutNote}>
                <T id="shop.saleNotice" />{" "}
                <Link className={styles.statutLien} href="/contact">
                  <T id="shop.notify" />
                </Link>
              </p>
            )}
          </div>
        </section>

        {/* role="list" : Safari retire les sémantiques de liste dès que
            list-style vaut none. */}
        <ul className={styles.grille} role="list" aria-label="Apollon">
          {products.map((product, index) => (
            <li
              className={styles.carte}
              id={product.slug}
              key={product.slug}
              data-aj-reveal
              /* L'accent descend du swatch produit : jamais une couleur inventée. */
              style={{ "--bq-accent": product.swatch } as CSSProperties}
            >
              {/*
                data-aj-presse : la moitié « départ » du relais vers la fiche.
                Le geste est posé par GSAP dans AjScrollReveal — rien ici
                n'intercepte le clic, <Link> navigue et précharge comme
                d'habitude.
              */}
              <Link
                className={styles.carteLien}
                href={`/products/${product.slug}`}
                data-aj-presse
              >
                <span className={styles.carteMedia}>
                  <Image
                    unoptimized
                    src={product.image}
                    alt={`${product.model} ${product.name}`}
                    fill
                    sizes="(max-width: 760px) 100vw, 33vw"
                    priority={index === 0}
                  />
                </span>
                <span className={styles.carteVoile} aria-hidden="true" />

                {/*
                  Les pastilles 01/02/03 sont retirées. Trois noms de teinte
                  sont le seul capital narratif d'une gamme à un modèle ; les
                  faire précéder d'un numéro les range en références de
                  catalogue. C'est aussi le motif que la veille documente comme
                  plafonnant la note d'un e-commerce mode en 2026. Le nom porte
                  seul l'identité, en bas de carte, au corps le plus grand.
                */}
                <span className={styles.carteAction}>
                  <T id="shop.discover" />
                  <span aria-hidden="true">→</span>
                </span>

                <span className={styles.carteBas}>
                  <span className={styles.carteNom}>
                    {product.name}
                  </span>

                  <span className={styles.carteLigne}>
                    <span className={styles.carteTon}>
                      <LocalizedProductText slug={product.slug} field="tone" />
                    </span>
                    <span className={styles.cartePrix}>
                      <LocalizedPrice amountCents={product.priceCents} />
                    </span>
                  </span>

                  {/*
                    Les quatre tailles vivaient ici en `aria-hidden`, donc
                    décoratives, et faisaient de chaque carte une pile de six
                    couches : numéro, « Découvrir », nom, ton, prix, tailles.
                    Le corpus mode primé 2026 en pose une ou deux. Elles
                    rejoignent la section matière, où elles sont un fait produit
                    et non un ornement de vignette.
                  */}
                </span>

                <span className={styles.carteFilet} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>

        <section className={styles.matiere} aria-labelledby="boutique-matiere">
          <div className={styles.matiereFrame}>
            <div className={styles.matiereMedia} data-aj-para>
              <Image
                unoptimized
                src={MATIERE_IMAGE}
                alt="Ceinture premium 3,5 cm, logo métallique AJ Luxury"
                fill
                sizes="(max-width: 760px) 100vw, 50vw"
              />
            </div>
          </div>

          <div className={styles.matiereTexte}>
            <div className={styles.matiereBloc}>
              <h2
                className={styles.composition}
                id="boutique-matiere"
                data-aj-reveal
              >
                <span className={styles.chiffre}>94</span>
                <span className={styles.compositionLabel}>
                  <T id="home.materialModal" />
                </span>
                <span className={styles.chiffre}>6</span>
                <span className={styles.compositionLabel}>
                  <T id="home.materialElastane" />
                </span>
              </h2>

              <p className={styles.matierePhrase} data-aj-reveal>
                <T id="home.apollonStatement" />
              </p>

              {/*
                La colonne de droite de cette section était remplie à 18 % —
                233 px de contenu dans 1289 px à 1920, un vide né de deux hauteurs
                incompatibles, que l'AGENTS compte explicitement comme un défaut.
                Les deux faits qui encombraient l'ouverture le remplissent : ils
                décrivent la pièce, ils sont donc à leur place ici, contre la
                matière. La composition n'est pas répétée — le 94 / 6 ci-dessus
                la dit déjà, au corps le plus grand de la page.
              */}
              <dl className={styles.faits} data-aj-reveal>
                <div className={styles.fait}>
                  <dt>
                    <T id="home.colors" />
                  </dt>
                  {/* Un nom de coloris ne se coupe jamais en deux : la césure
                      tombe sur les séparateurs. */}
                  <dd>
                    {products.map((product, index) => (
                      <span key={product.slug}>
                        {index > 0 ? " · " : null}
                        <span className={styles.insecable}>{product.name}</span>
                      </span>
                    ))}
                  </dd>
                </div>

                <div className={styles.fait}>
                  <dt>
                    <T id="home.sizes" />
                  </dt>
                  <dd>{sizes.join(" · ")}</dd>
                </div>
              </dl>
            </div>

            <span className={styles.matiereSignature} data-aj-reveal>
              <T id="nav.material" /> · <T id="product.feature.5" />
            </span>
          </div>
        </section>
      </AjScrollReveal>

      <StoreFooter />
    </main>
  );
}
