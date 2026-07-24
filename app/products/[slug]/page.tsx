import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductGalleryZoom from "../../components/ProductGalleryZoom";
import ProductPurchase from "../../components/ProductPurchase";
import StoreFooter from "../../components/StoreFooter";
import StoreHeader from "../../components/StoreHeader";
import { getProduct, getProducts } from "../../../lib/products";

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

  return (
    <main className="pdp">
      <StoreHeader variant="minimal" />

      <nav className="breadcrumb" aria-label="Fil d’Ariane">
        <Link href="/">Accueil</Link>
        <span>/</span>
        <Link href="/shop">Collection</Link>
        <span>/</span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <section className="product-hero">
        <ProductGalleryZoom
          images={product.gallery}
          model={product.model}
          color={product.name}
        />

        <ProductPurchase product={product} products={products} />
      </section>

      <section className="product-story">
        <p>{product.name}</p>
        <h2>{product.tagline}</h2>
        <p>
          Coupe boxer classique. Composition : 94 % modal – 6 % élasthanne.
          Ceinture de 3,5 cm. Logo métallique AJ Luxury.
        </p>
      </section>

      <section className="benefit-grid" aria-label="Composition et bénéfices">
        {product.benefits.map((benefit, index) => (
          <article key={benefit.title}>
            <span>0{index + 1}</span>
            <h2>{benefit.title}</h2>
            <p>{benefit.text}</p>
          </article>
        ))}
      </section>

      <section className="product-information">
        <div>
          <p>Informations produit</p>
          <h2>Caractéristiques</h2>
        </div>
        <div className="product-information__details">
          <details open>
            <summary>Détails & composition</summary>
            <p>
              Coupe boxer classique. 94% modal et 6% élasthanne. Ceinture
              élastique premium de 3,5 cm avec logo métallique AJ Luxury.
            </p>
          </details>
          <details>
            <summary>Entretien</summary>
            <p>Consignes définitives à reprendre depuis l’étiquette produit.</p>
          </details>
          <details id="guide-tailles">
            <summary>Guide des tailles</summary>
            <p>Tailles disponibles : S, M, L et XL. Barème à confirmer.</p>
          </details>
        </div>
      </section>

      <section className="other-colors">
        <div>
          <p>La collection</p>
          <h2>Trois coloris.</h2>
        </div>
        <div className="other-colors__grid">
          {products.map((item) => (
            <Link href={`/products/${item.slug}`} key={item.slug}>
              <div>
                <Image
                  unoptimized
                  src={item.image}
                  alt={`${item.model}, coloris ${item.name}`}
                  fill
                  sizes="(max-width: 760px) 100vw, 33vw"
                />
              </div>
              <span>{item.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <StoreFooter />
    </main>
  );
}
