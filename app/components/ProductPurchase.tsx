"use client";

import Link from "next/link";
import { useState } from "react";
import type { Product, ProductSize } from "../../lib/products";
import { formatPrice, sizes } from "../../lib/products";

type ProductPurchaseProps = {
  product: Product;
  products: Product[];
};

export default function ProductPurchase({
  product,
  products,
}: ProductPurchaseProps) {
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [added, setAdded] = useState(false);

  function selectSize(size: ProductSize) {
    setSelectedSize(size);
    setAdded(false);
  }

  return (
    <div className="purchase-panel">
      <p className="purchase-panel__eyebrow">{product.statusLabel}</p>
      <h1>{product.model}</h1>
      <p className="purchase-panel__color">{product.name}</p>

      <div className="purchase-panel__price">
        <strong>{formatPrice(product.priceCents)}</strong>
        <span>Tarif en cours de validation</span>
      </div>

      <p className="purchase-panel__description">{product.description}</p>

      <div className="variant-selector">
        <div className="selector-heading">
          <span>Couleur</span>
          <strong>{product.color}</strong>
        </div>
        <div className="variant-selector__options">
          {products.map((variant) => (
            <Link
              className={variant.slug === product.slug ? "is-active" : ""}
              href={`/products/${variant.slug}`}
              key={variant.slug}
              aria-current={variant.slug === product.slug ? "page" : undefined}
            >
              <span
                className="variant-selector__swatch"
                style={{ backgroundColor: variant.swatch }}
                aria-hidden="true"
              />
              <span>{variant.name}</span>
            </Link>
          ))}
        </div>
      </div>

      <fieldset className="size-selector">
        <legend className="selector-heading">
          <span>Choisir une taille</span>
          <a href="#guide-tailles">Guide des tailles</a>
        </legend>
        <div className="size-selector__options">
          {sizes.map((size) => (
            <button
              type="button"
              key={size}
              aria-pressed={selectedSize === size}
              onClick={() => selectSize(size)}
            >
              {size}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        className="purchase-button"
        type="button"
        disabled={!selectedSize}
        onClick={() => setAdded(true)}
      >
        {added
          ? `Ajouté · Taille ${selectedSize}`
          : selectedSize
            ? "Ajouter à la sélection · démo"
            : "Sélectionnez une taille"}
      </button>

      <p className="purchase-panel__notice" role="status" aria-live="polite">
        {added
          ? "Article ajouté au panier de démonstration."
          : "Paiement désactivé sur cette maquette."}
      </p>

      {added && (
        <Link
          className="purchase-panel__cart-link"
          href={`/cart?variant=variant_boxer_${product.slug}_${selectedSize?.toLowerCase()}`}
        >
          Voir le panier
        </Link>
      )}

      <div className="purchase-panel__service">
        <span>Livraison à préciser</span>
        <span>Paiement à intégrer</span>
        <span>Retours à préciser</span>
      </div>
    </div>
  );
}
