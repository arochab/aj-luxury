"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./StoreChrome.module.css";

type StoreHeaderProps = {
  variant?: "default" | "minimal";
};

const navigation = [
  { href: "/shop", label: "Boutique" },
  { href: "/notre-histoire", label: "Notre histoire" },
];

const accountLinks = [
  { href: "/account", label: "Compte" },
  { href: "/cart", label: "Panier" },
];

export default function StoreHeader({
  variant = "default",
}: StoreHeaderProps) {
  const pathname = usePathname();

  return (
    <header
      className={`${styles.header} ${
        variant === "minimal" ? styles.headerMinimal : ""
      }`}
    >
      <Link className={styles.brand} href="/" aria-label="AJ Luxury, accueil">
        <Image
          className={styles.brandImage}
          src="/images/aj-luxury-logo.webp"
          alt=""
          width={180}
          height={92}
          priority
          unoptimized
        />
      </Link>

      {variant === "default" ? (
        <nav className={styles.desktopNav} aria-label="Navigation principale">
          {navigation.map((item) => (
            <Link
              className={styles.navLink}
              href={item.href}
              key={item.label}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
          <span
            className={styles.socialPending}
            aria-label="Instagram, lien officiel à confirmer"
            title="Compte officiel à confirmer"
          >
            Instagram
          </span>
        </nav>
      ) : null}

      <div className={styles.actions}>
        {accountLinks.map((item) => (
          <Link className={styles.actionLink} href={item.href} key={item.label}>
            {item.label}
          </Link>
        ))}
      </div>
    </header>
  );
}
