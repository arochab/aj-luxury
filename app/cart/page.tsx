import Image from "next/image";
import Link from "next/link";
import { createDemoCart } from "../../lib/commerce";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import styles from "./CommerceShell.module.css";

export const metadata = {
  title: "Panier de démonstration | AJ Luxury",
  robots: { index: false, follow: false },
};

type CartPageProps = {
  searchParams: Promise<{ variant?: string }>;
};

export default async function CartPage({ searchParams }: CartPageProps) {
  const { variant } = await searchParams;
  const cart = await createDemoCart(variant);
  const selectedVariant = cart.lines[0]?.variant.id;

  return (
    <main className={styles.shell}>
      <StoreHeader variant="minimal" />
      <aside className={styles.notice}>
        Parcours de démonstration · aucune commande ne sera enregistrée
      </aside>

      <div className={styles.main}>
        <section>
          <p className={styles.eyebrow}>Panier · 1 article</p>
          <h1 className={styles.title}>Votre sélection.</h1>
          {cart.lines.map((line) => (
            <article className={styles.line} key={line.id}>
              <div className={styles.lineImage}>
                <Image
                  src={line.variant.imageUrl}
                  alt={`${line.variant.productName} ${line.variant.color.name}`}
                  fill
                  unoptimized
                  sizes="140px"
                />
              </div>
              <div>
                <h2>{line.variant.productName}</h2>
                <p>
                  {line.variant.color.name} · Taille {line.variant.size}
                  <br />
                  Référence {line.variant.sku}
                </p>
              </div>
              <strong>Prix à confirmer</strong>
            </article>
          ))}
        </section>

        <aside className={styles.summary}>
          <p className={styles.eyebrow}>Récapitulatif</p>
          <h2>Total estimé</h2>
          <div className={styles.row}>
            <span>Sous-total</span>
            <span>À confirmer</span>
          </div>
          <div className={styles.row}>
            <span>Livraison</span>
            <span>À définir</span>
          </div>
          <div className={`${styles.row} ${styles.total}`}>
            <span>Total provisoire</span>
            <span>À confirmer</span>
          </div>
          <Link
            className={styles.button}
            href={
              selectedVariant
                ? `/checkout?variant=${encodeURIComponent(selectedVariant)}`
                : "/checkout"
            }
          >
            Simuler le checkout
          </Link>
          <Link
            className={styles.secondary}
            href={
              cart.lines[0]
                ? `/products/${cart.lines[0].variant.productSlug}`
                : "/shop"
            }
          >
            Modifier la sélection
          </Link>
          <p className={styles.muted}>
            Prix, livraison, taxes et conditions commerciales à confirmer.
          </p>
        </aside>
      </div>
      <StoreFooter />
    </main>
  );
}
