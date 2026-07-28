import Link from "next/link";
import { createDemoCart } from "../../lib/commerce";
import { getProduct } from "../../lib/products";
import StoreHeader from "../components/StoreHeader";
import LocalizedPrice from "../components/LocalizedPrice";
import { T } from "../../lib/i18n/TranslatedText";
import styles from "../cart/CommerceShell.module.css";

export const metadata = {
  title: "Checkout simulé | AJ Luxury",
  robots: { index: false, follow: false },
};

type CheckoutPageProps = {
  searchParams: Promise<{ variant?: string }>;
};

export default async function CheckoutPage({
  searchParams,
}: CheckoutPageProps) {
  const { variant } = await searchParams;
  const cart = await createDemoCart(variant);
  const subtotalCents = cart.lines.reduce(
    (total, line) =>
      total + (getProduct(line.variant.productSlug)?.priceCents ?? 0),
    0,
  );

  return (
    <main className={styles.shell}>
      <StoreHeader variant="minimal" />
      <div className={styles.header} aria-label="Navigation du paiement">
        <Link
          href={
            variant
              ? `/cart?variant=${encodeURIComponent(variant)}`
              : "/cart"
          }
        >
          <T id="checkout.backToCart" />
        </Link>
        <span />
        <span><T id="checkout.demoLabel" /></span>
      </div>
      <aside className={styles.notice}>
        <T id="checkout.previewNotice" />
      </aside>

      <div className={styles.main}>
        <section>
          <p className={styles.eyebrow}><T id="checkout.step" /></p>
          <h1 className={styles.title}><T id="checkout.shippingTitle" /></h1>
          <form className={styles.form}>
            <label>
              <T id="checkout.email" />
              <input
                type="email"
                autoComplete="email"
                placeholder="vous@exemple.fr"
              />
            </label>
            <div className={styles.formGrid}>
              <label>
                <T id="checkout.firstName" />
                <input autoComplete="given-name" />
              </label>
              <label>
                <T id="checkout.lastName" />
                <input autoComplete="family-name" />
              </label>
            </div>
            <label>
              <T id="checkout.address" />
              <input autoComplete="street-address" />
            </label>
            <div className={styles.formGrid}>
              <label>
                <T id="checkout.postalCode" />
                <input autoComplete="postal-code" placeholder="75000" />
              </label>
              <label>
                <T id="checkout.city" />
                <input autoComplete="address-level2" placeholder="Paris" />
              </label>
            </div>
            <button className={styles.lockedButton} type="button" disabled>
              <T id="checkout.paymentComingSoon" />
            </button>
          </form>
        </section>

        <aside className={styles.summary}>
          <p className={styles.eyebrow}><T id="checkout.selection" /></p>
          {cart.lines.map((line) => (
            <div className={styles.row} key={line.id}>
              <span>
                {line.variant.productName}
                <br />
                {line.variant.color.name} · {line.variant.size}
              </span>
              <span>
                <LocalizedPrice
                  amountCents={
                    getProduct(line.variant.productSlug)?.priceCents ?? null
                  }
                />
              </span>
            </div>
          ))}
          <div className={`${styles.row} ${styles.total}`}>
            <span><T id="checkout.provisionalTotal" /></span>
            <span><LocalizedPrice amountCents={subtotalCents} /></span>
          </div>
          <p className={styles.muted}>
            <T id="checkout.securityNote" />
          </p>
        </aside>
      </div>
    </main>
  );
}
