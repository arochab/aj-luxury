import Image from "next/image";
import Link from "next/link";
import styles from "./StoreChrome.module.css";

export default function StoreFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerTop}>
        <section className={styles.footerIdentity} aria-labelledby="footer-title">
          <Image
            className={styles.footerLogo}
            src="/images/aj-luxury-logo.webp"
            alt="AJ Luxury"
            width={180}
            height={92}
            unoptimized
          />
          <h2 className={styles.footerTitle} id="footer-title">
            Reveal Your Inner Beauty
          </h2>
          <p className={styles.footerCopy}>
            Sous-vêtements masculins conçus autour du confort, de la qualité et
            de la confiance en soi.
          </p>
        </section>

        <div className={styles.footerColumns}>
          <section aria-labelledby="footer-boutique">
            <h3 className={styles.footerHeading} id="footer-boutique">
              Boutique
            </h3>
            <nav className={styles.footerLinks} aria-label="Liens boutique">
              <Link className={styles.footerLink} href="/shop">
                Collection Apollon
              </Link>
              <Link className={styles.footerLink} href="/account">
                Mon compte
              </Link>
              <Link className={styles.footerLink} href="/shipping-returns">
                Livraison et retours
              </Link>
            </nav>
          </section>

          <section aria-labelledby="footer-informations">
            <h3 className={styles.footerHeading} id="footer-informations">
              Informations
            </h3>
            <nav className={styles.footerLinks} aria-label="Liens informations">
              <Link className={styles.footerLink} href="/notre-histoire">
                Notre histoire
              </Link>
              <Link className={styles.footerLink} href="/contact">
                Contact
              </Link>
              <Link className={styles.footerLink} href="/privacy">
                Confidentialité
              </Link>
              <Link className={styles.footerLink} href="/terms">
                Conditions générales
              </Link>
              <Link className={styles.footerLink} href="/legal-notice">
                Mentions légales
              </Link>
              <Link className={styles.footerLink} href="/cookies">
                Cookies
              </Link>
              <span className={styles.instagramPending}>
                Instagram · compte à confirmer
              </span>
            </nav>
          </section>

          <section
            className={styles.newsletterColumn}
            aria-labelledby="footer-newsletter"
          >
            <h3 className={styles.footerHeading} id="footer-newsletter">
              Newsletter
            </h3>
            <div className={styles.newsletter} aria-describedby="newsletter-note">
              <input
                type="email"
                placeholder="Votre adresse e-mail"
                aria-label="Votre adresse e-mail"
                disabled
              />
              <button type="button" disabled>
                Bientôt
              </button>
            </div>
            <p className={styles.newsletterNote} id="newsletter-note">
              Maquette uniquement. Aucune adresse n’est collectée à ce stade.
            </p>
          </section>
        </div>
      </div>

      <div className={styles.footerBottom}>
        <span>© {new Date().getFullYear()} AJ Luxury</span>
        <span>Reveal Your Inner Beauty</span>
      </div>
    </footer>
  );
}
