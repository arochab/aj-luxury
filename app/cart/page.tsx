import Image from "next/image";
import Link from "next/link";
import { createDemoCart } from "../../lib/commerce";
import { getProduct } from "../../lib/products";
import LocalizedPrice from "../components/LocalizedPrice";
import StoreFooter from "../components/StoreFooter";
import StoreHeader from "../components/StoreHeader";
import { T } from "../../lib/i18n/TranslatedText";
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
  const subtotalCents = cart.lines.reduce(
    (total, line) =>
      total + (getProduct(line.variant.productSlug)?.priceCents ?? 0),
    0,
  );

  return (
    <main className={styles.shell}>
      <StoreHeader variant="minimal" />
      <aside className={styles.notice}>
        <T id="cart.demoNotice" />
      </aside>

      <div className={styles.main}>
        <section>
          <p className={styles.eyebrow}>
            <T id="cart.eyebrow" />
          </p>
          <h1 className={styles.title}>
            <T id="cart.selectionTitle" />
          </h1>
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
                  {line.variant.color.name} · <T id="product.size" /> {line.variant.size}
                  <br />
                  <T id="cart.reference" /> {line.variant.sku}
                </p>
              </div>
              <strong>
                <LocalizedPrice
                  amountCents={
                    getProduct(line.variant.productSlug)?.priceCents ?? null
                  }
                />
              </strong>
            </article>
          ))}
        </section>

        <aside className={styles.summary}>
          <p className={styles.eyebrow}>
            <T id="cart.summary" />
          </p>
          <h2>
            <T id="cart.estimatedTotal" />
          </h2>
          <div className={styles.row}>
            <span><T id="cart.subtotal" /></span>
            <span><LocalizedPrice amountCents={subtotalCents} /></span>
          </div>
          <div className={styles.row}>
            <span><T id="cart.shipping" /></span>
            <span><T id="cart.toDefine" /></span>
          </div>
          <div className={`${styles.row} ${styles.total}`}>
            <span><T id="cart.provisionalTotal" /></span>
            <span><LocalizedPrice amountCents={subtotalCents} /></span>
          </div>
          <Link
            className={styles.button}
            href={
              selectedVariant
                ? `/checkout?variant=${encodeURIComponent(selectedVariant)}`
                : "/checkout"
            }
          >
            <T id="cart.simulateCheckout" />
          </Link>
          <Link
            className={styles.secondary}
            href={
              cart.lines[0]
                ? `/products/${cart.lines[0].variant.productSlug}`
                : "/shop"
            }
          >
            <T id="cart.modifySelection" />
          </Link>
          <p className={styles.muted}>
            <T id="cart.conditionsPending" />
          </p>
        </aside>
      </div>
      <StoreFooter />
    </main>
  );
}
