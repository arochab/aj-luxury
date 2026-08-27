"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { getLocalizedProductCopy } from "@/lib/i18n/product-copy";
import {
  addCartPack,
  CartApiError,
  ensureOpenCart,
  getCart,
  setCartLineQuantity,
} from "../../lib/commerce/preprod-cart-client";
import { createLaunchVariantId } from "../../lib/commerce/product-identifiers";
import {
  AJ_APOLLON_MAX_PACK_SIZE,
  AJ_APOLLON_PACK_PRICE_CENTS,
} from "../../lib/commerce/pack-pricing";
import type {
  PublicStockBySize,
  PublicStockStatus,
} from "../../lib/commerce/public-stock";
import type { Product, ProductSize } from "../../lib/products";
import { formatPrice, sizes } from "../../lib/products";
import styles from "./ProductPage.module.css";
import type { CommerceRuntimeMode } from "../../lib/commerce/commerce-runtime";

/* Un seul panneau d'achat par page : un identifiant constant suffit et reste
   stable entre le rendu serveur et l'hydratation, ce qu'un id généré ne
   garantirait pas pour une cible d'`aria-describedby`. */
const NOTICE_ID = "aj-purchase-notice";
const PRODUCT_COLOR_ORDER = [
  "pourpre",
  "rose-pale",
  "lilas-bleu-clair",
] as const;

type PackSize = keyof typeof AJ_APOLLON_PACK_PRICE_CENTS;

const PACK_OPTIONS: ReadonlyArray<{
  count: PackSize;
  labelKey: "product.unitOffer" | "product.duoOffer" | "product.trioOffer";
  savingCents: number;
}> = [
  {
    count: 1,
    labelKey: "product.unitOffer",
    savingCents: 0,
  },
  {
    count: 2,
    labelKey: "product.duoOffer",
    savingCents: 999,
  },
  {
    count: 3,
    labelKey: "product.trioOffer",
    savingCents: 1_998,
  },
];

type ProductPurchaseProps = {
  product: Product;
  products: Product[];
  /* Résolue sur le serveur et reçue au premier rendu. `null` signale un échec
     de résolution : seul cas où l'on retombe sur « vérifié à l'ajout ». */
  availability: PublicStockBySize | null;
  runtimeMode: CommerceRuntimeMode;
  reviewMode: boolean;
};

export default function ProductPurchase({
  product,
  products,
  availability,
  runtimeMode,
  reviewMode,
}: ProductPurchaseProps) {
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [selectedPackSize, setSelectedPackSize] = useState<PackSize>(1);
  const [selectedPackColors, setSelectedPackColors] = useState<string[]>(() =>
    Array.from({ length: AJ_APOLLON_MAX_PACK_SIZE }, () => product.slug),
  );
  const [feedback, setFeedback] = useState<
    | { kind: "success"; quantity: number; size: ProductSize }
    | { kind: "error"; code: string }
    | null
  >(null);
  const [cartBusy, setCartBusy] = useState(false);
  const cartError = useRef<HTMLParagraphElement>(null);
  const cartRequestInFlight = useRef(false);
  const cartCreateAttempt = useRef<string | null>(null);
  const cartMutationAttempt = useRef<{
    fingerprint: string;
    key: string;
  } | null>(null);
  const { locale, t } = useI18n();
  const localizedProduct = getLocalizedProductCopy(t, product.slug);
  const orderedProducts = PRODUCT_COLOR_ORDER.flatMap((slug) => {
    const variant = products.find((candidate) => candidate.slug === slug);
    return variant ? [variant] : [];
  });

  /* Une seule lecture de la disponibilité, la même pour l'étiquette, l'état
     grisé et le garde-fou de sélection. `null` = non résolue. */
  function stockOf(size: ProductSize): PublicStockStatus | null {
    return availability?.[size] ?? null;
  }

  /* `availability` vient de lib/commerce/internal-stock.ts, dont la note dit
     ce qu'il est : un registre INTERNE DE MAQUETTE, codé en dur. Il ne lit pas
     D1. En préproduction c'est exactement ce qu'on veut, la démonstration doit
     montrer des états de stock. En production il n'a aucune autorité, et le
     laisser griser une taille reviendrait à refuser la vente d'un article
     réellement en stock, sur la foi d'un chiffre inventé. */
  function isSoldOut(size: ProductSize) {
    if (!availability) return false;
    const soldOut = runtimeMode === "preproduction" &&
      availability[size].state === "sold-out";
    return soldOut;
  }

  function selectSize(size: ProductSize) {
    // Le bouton reste focusable (aria-disabled), donc le refus se joue ici.
    if (isSoldOut(size)) return;

    setSelectedSize(size);
    setFeedback(null);
  }

  function selectPackSize(packSize: PackSize) {
    setSelectedPackSize(packSize);
    setFeedback(null);
  }

  function selectPackColor(slotIndex: number, productSlug: string) {
    setSelectedPackColors((current) =>
      current.map((slug, index) => index === slotIndex ? productSlug : slug),
    );
    setFeedback(null);
  }

  function stockLabel(size: ProductSize) {
    if (reviewMode) {
      const stock = stockOf(size);
      if (!stock) return t("product.stockCheckedAtAdd");
      if (stock.state === "sold-out") return t("product.soldOutLive");
      if (stock.state === "low-stock") {
        return t("product.onlyLeft").replace("{count}", String(stock.remaining));
      }
      return t("product.availableLive");
    }

    /* EN PRODUCTION, LE REGISTRE DE MAQUETTE NE PARLE PAS. Il est codé en dur
       et ne lit pas D1 : afficher « Disponible » ou « Plus que 3 » à partir de
       lui serait annoncer à un client un chiffre inventé. Le bouton n'affiche
       donc aucune promesse de disponibilité ; l'ajout au panier reste contrôlé
       par la vraie base.

       Ce garde-fou est antérieur à la refonte du front ; je l'avais supprimé
       en réécrivant cette fonction, et c'est le test
       « mock product availability has no authority over production sizes »
       qui l'a rattrapé. Il retourne ici en premier, avant toute autre
       branche, pour qu'aucune reformulation ultérieure ne puisse le
       contourner par accident.

       Conséquence assumée : les libellés « Live » restent inutilisés tant que
       le stock réel n'est pas branché sur cette page. Les supprimer serait
       perdre le vocabulaire du jour où il le sera. */
    if (runtimeMode === "production") return "";

    const stock = stockOf(size);

    // Repli, et uniquement repli : la disponibilité n'a pas pu être résolue.
    if (!stock) return t("product.stockCheckedAtAdd");

    const simulated = runtimeMode === "preproduction";

    if (stock.state === "sold-out") {
      return simulated ? t("product.soldOut") : t("product.soldOutLive");
    }

    if (stock.state === "low-stock") {
      return simulated
        ? t("product.lowStockSimulated")
        : t("product.onlyLeft").replace("{count}", String(stock.remaining));
    }

    /* Commerce fermé : le stock est peut-être là, mais rien n'est
       achètable. Annoncer « Disponible » sous chacune des quatre tailles pendant
       que la même colonne déclare la vente non ouverte est la contradiction la
       plus nette du parcours — le site déclare disponible un stock qu'il refuse
       de vendre. On annonce donc l'échéance, pas une disponibilité. Le libellé
       alimente aussi l'aria-label de la taille : « Taille S, disponibilité à
       l'ouverture » reste une phrase complète pour un lecteur d'écran. */
    if (runtimeMode === "closed") {
      return t("product.availabilityAtOpeningShort");
    }

    return simulated ? t("product.available") : t("product.availableLive");
  }

  useEffect(() => {
    if (feedback?.kind !== "error") return;
    cartError.current?.focus({ preventScroll: true });
  }, [feedback]);

  async function addToCart() {
    if (!selectedSize || cartRequestInFlight.current) return;

    cartRequestInFlight.current = true;
    setCartBusy(true);
    setFeedback(null);
    try {
      const variantIds = selectedPackSize === 1
        ? [createLaunchVariantId(product.slug, selectedSize)]
        : selectedPackColors
            .slice(0, selectedPackSize)
            .map((productSlug) =>
              createLaunchVariantId(productSlug, selectedSize));
      if (runtimeMode === "closed") throw new CartApiError("CART_UNAVAILABLE");
      let currentCart;
      if (runtimeMode === "production") {
        currentCart = await getCart("production");
        if (currentCart.status === "empty") {
          const key = cartCreateAttempt.current ?? crypto.randomUUID();
          cartCreateAttempt.current = key;
          currentCart = await ensureOpenCart("production", key);
          cartCreateAttempt.current = null;
        }
      } else {
        currentCart = await ensureOpenCart("preproduction");
      }
      if (currentCart.itemCount + selectedPackSize > AJ_APOLLON_MAX_PACK_SIZE) {
        throw new CartApiError("MAX_QUANTITY");
      }

      const requestedQuantities = new Map<string, number>();
      for (const variantId of variantIds) {
        requestedQuantities.set(
          variantId,
          (requestedQuantities.get(variantId) ?? 0) + 1,
        );
      }
      const exceedsVariantLimit = Array.from(requestedQuantities).some(
        ([variantId, addition]) =>
          (currentCart.lines.find((line) => line.variantId === variantId)
            ?.quantity ?? 0) + addition > AJ_APOLLON_MAX_PACK_SIZE,
      );
      if (exceedsVariantLimit) {
        throw new CartApiError("MAX_QUANTITY");
      }

      const fingerprint = selectedPackSize === 1
        ? `line:${variantIds[0]}:${
            (currentCart.lines.find((line) =>
              line.variantId === variantIds[0])?.quantity ?? 0) + 1}`
        : `pack:${variantIds.join(",")}`;
      const lineKey = runtimeMode === "production"
        ? cartMutationAttempt.current?.fingerprint === fingerprint
          ? cartMutationAttempt.current.key
          : crypto.randomUUID()
        : undefined;
      if (runtimeMode === "production" && lineKey) {
        cartMutationAttempt.current = { fingerprint, key: lineKey };
      }
      const updatedCart = selectedPackSize === 1
        ? await setCartLineQuantity(
            variantIds[0],
            (currentCart.lines.find((line) =>
              line.variantId === variantIds[0])?.quantity ?? 0) + 1,
            runtimeMode,
            lineKey,
          )
        : await addCartPack(variantIds, runtimeMode, lineKey);
      cartMutationAttempt.current = null;
      const packPersisted = Array.from(requestedQuantities).every(
        ([variantId, addition]) => {
          const previousQuantity = currentCart.lines.find(
            (line) => line.variantId === variantId,
          )?.quantity ?? 0;
          const updatedQuantity = updatedCart.lines.find(
            (line) => line.variantId === variantId,
          )?.quantity ?? 0;
          return updatedQuantity >= previousQuantity + addition;
        },
      );
      if (!packPersisted) throw new CartApiError("MALFORMED_RESPONSE");
      setFeedback({
        kind: "success",
        quantity: selectedPackSize,
        size: selectedSize,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        code: error instanceof CartApiError ? error.code : "CART_UNAVAILABLE",
      });
    } finally {
      cartRequestInFlight.current = false;
      setCartBusy(false);
    }
  }

  function cartFeedbackText() {
    if (feedback?.kind === "success") {
      return t(
        feedback.quantity === 1
          ? "product.cartAddedOne"
          : "product.cartAddedMany",
      )
        .replace("{size}", feedback.size)
        .replace("{count}", String(feedback.quantity));
    }
    if (feedback?.kind === "error") {
      if (feedback.code === "OUT_OF_STOCK") {
        return t("product.cartOutOfStock");
      }
      if (feedback.code === "MAX_QUANTITY") {
        return runtimeMode === "production"
          ? t("checkout.parcelUnavailable")
          : t("product.cartMaxQuantity");
      }
      return t("product.cartUnavailable");
    }
    if (reviewMode) return t("product.reviewNotice");
    return runtimeMode === "preproduction"
      ? t("product.cartSecureNotice")
      : runtimeMode === "production"
        ? t("product.securePayment")
        : /*
             Commerce fermé : la boutique n'est pas en panne, elle n'est pas
             encore ouverte. `product.cartUnavailable` (« momentanément
             indisponible, réessayez dans un instant ») racontait une panne
             passagère et contredisait /cart et /checkout, qui disent tous deux
             qu'il s'agit d'une démonstration. app/cart/page.tsx l. 73-81 refuse
             déjà de monter CartClient pour cette raison exacte ; la fiche
             produit applique enfin le même garde-fou. `cartUnavailable` reste
             réservé aux vraies pannes de preproduction/production.
           */
          t("product.cartClosed");
  }

  /* Une seule lecture du refus, partagée par l'attribut ARIA et par le
     gestionnaire de clic : les deux ne peuvent pas diverger. */
  const purchaseBlocked =
    !selectedSize ||
    isSoldOut(selectedSize) ||
    cartBusy ||
    runtimeMode === "closed";

  return (
    <aside
      className={styles.purchasePanel}
      aria-label={t("product.purchaseInfoLabel")}
      aria-busy={cartBusy}
    >
      {/* Le modèle et le coloris reprennent l'identité sobre de la fiche publiée. */}
      <div className={styles.identity} data-aj-reveal>
        <p className={styles.eyebrow}>{t("product.status")}</p>
        <h1>{product.model}</h1>
        <p className={styles.colorName}>{product.name}</p>
      </div>

      {/* ── LE PRIX NE S'AFFICHE JAMAIS NU TANT QUE LA VENTE EST FERMEE ──
          La qualification n'etait rendue qu'en `preproduction`. Or l'etat
          `closed` — celui d'un environnement sans APP_ENV, donc l'etat par
          defaut — montrait « 29,99 € » SEUL, sans rien qui dise que la vente
          n'est pas ouverte et que ce montant n'est pas encore commercial.
          Un chiffre nu sur une fiche produit se lit comme un prix de vente :
          c'est la lecture qu'un client en fait, et elle serait fausse.

          CE QUI N'EST PAS ECRIT ICI, ET POURQUOI. Aucune mention « TTC » :
          le vendeur ne collecte pas de TVA au titre de la franchise en base.
          La mention fiscale canonique vit dans `lib/legal.ts` et sur les CGV
          ainsi que les factures, sans surcharger le bloc prix restauré.

          `product.priceLabel` existe deja dans les cinq langues : rien n'est
          traduit ici, seule sa condition d'affichage change. */}
      <div className={styles.price} data-aj-reveal>
        <strong>{formatPrice(product.priceCents, locale)}</strong>
        {reviewMode
          ? <span>{t("product.reviewPrice")}</span>
          : runtimeMode !== "production" && (
              <span>{t("product.priceLabel")}</span>
            )}
      </div>

      <p className={styles.description} data-aj-reveal>
        {localizedProduct.description}
      </p>

      <fieldset className={`${styles.selector} ${styles.packSelector}`}>
        <legend className={styles.selectorHeading}>
          <span>{t("product.chooseOffer")}</span>
        </legend>

        <div className={styles.packOptions}>
          {PACK_OPTIONS.map((option) => (
            <button
              className={styles.packOption}
              type="button"
              key={option.count}
              aria-pressed={selectedPackSize === option.count}
              onClick={() => selectPackSize(option.count)}
            >
              <span className={styles.packOptionTopline}>
                <span className={styles.packOptionName}>{t(option.labelKey)}</span>
                <strong>
                  {formatPrice(AJ_APOLLON_PACK_PRICE_CENTS[option.count], locale)}
                </strong>
              </span>
              <span className={styles.packOptionMeta}>
                {option.savingCents > 0
                  ? t("product.packSaving").replace(
                      "{amount}",
                      formatPrice(option.savingCents, locale),
                    )
                  : t("product.unitPriceReference")}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {selectedPackSize === 1 && (
        <div className={styles.selector}>
          <div className={styles.selectorHeading}>
            <span>{t("product.color")}</span>
            <strong>{product.color}</strong>
          </div>
          <div className={styles.variantOptions}>
            {orderedProducts.map((variant) => (
              <Link
                className={`${styles.variant} ${
                  variant.slug === product.slug ? styles.variantActive : ""
                }`}
                href={`/products/${variant.slug}`}
                key={variant.slug}
                aria-current={variant.slug === product.slug ? "page" : undefined}
              >
                <span
                  className={styles.swatch}
                  style={{ backgroundColor: variant.swatch }}
                  aria-hidden="true"
                />
                <span className={styles.variantName}>{variant.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <fieldset className={styles.selector}>
        <legend className={styles.selectorHeading}>
          <span>{t("product.selectSize")}</span>
          {selectedSize && <strong>{selectedSize}</strong>}
        </legend>
        <div className={styles.sizeOptions}>
          {sizes.map((size) => {
            const label = stockLabel(size);
            const soldOut = isSoldOut(size);

            return (
              <button
                className={styles.sizeButton}
                type="button"
                key={size}
                aria-pressed={selectedSize === size}
                /* Le libellé visible est court pour que les quatre boîtes de
                   taille tiennent chacune sur une ligne ; l'assistance reçoit la
                   phrase entière, qui dit ce que « À l'ouverture » sous-entend. */
                aria-label={`${t("product.size")} ${size}${
                  reviewMode
                    ? `, ${label}`
                    : runtimeMode === "closed"
                    ? `, ${t("product.availabilityAtOpening")}`
                    : label
                    ? `, ${label}`
                    : ""
                }`}
                /* aria-disabled et non disabled : la taille en rupture reste
                   atteignable au clavier et annoncée par le lecteur d'écran,
                   au lieu de disparaître de l'ordre de tabulation. */
                aria-disabled={soldOut || undefined}
                onClick={() => selectSize(size)}
              >
                <span className={styles.sizeLetter}>{size}</span>
                {label && <span className={styles.sizeAvailability}>{label}</span>}
              </button>
            );
          })}
        </div>
      </fieldset>

      {selectedPackSize > 1 && selectedSize && (
        <div className={styles.packComposer}>
          <div className={styles.packComposerHeading}>
            <strong>{t("product.composePack")}</strong>
            <span>
              {t("product.size")} {selectedSize} · {t("product.oneSizeForPack")}
            </span>
          </div>

          <div className={styles.packSlots}>
            {Array.from({ length: selectedPackSize }, (_, slotIndex) => (
              <fieldset className={styles.packSlot} key={slotIndex}>
                <legend>
                  {t("product.packPiece").replace(
                    "{count}",
                    String(slotIndex + 1),
                  )}
                </legend>
                <div className={styles.packColorOptions}>
                  {orderedProducts.map((variant) => (
                    <button
                      className={styles.packColorOption}
                      type="button"
                      key={variant.slug}
                      aria-pressed={
                        selectedPackColors[slotIndex] === variant.slug
                      }
                      aria-label={`${t("product.packPiece").replace(
                        "{count}",
                        String(slotIndex + 1),
                      )} — ${variant.name}`}
                      onClick={() => selectPackColor(slotIndex, variant.slug)}
                    >
                      <span
                        className={styles.packColorSwatch}
                        style={{ backgroundColor: variant.swatch }}
                        aria-hidden="true"
                      />
                      <span>{variant.name}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      )}

      {/*
        LE REFUS AVANT LA PROMESSE. Cette phrase était placée APRÈS le bouton :
        on lisait le prix, les tailles annoncées disponibles, un bouton
        « Ajouter au panier », et seulement ensuite qu'il ne se passerait rien.
        L'ordre du document donnait l'espoir avant le refus. Il est inversé.
        `aria-describedby` continue de la rattacher au bouton, donc un lecteur
        d'écran l'entend au moment où il atteint la commande, quelle que soit
        sa position visuelle.
      */}
      <p
        id={NOTICE_ID}
        className={
          feedback?.kind === "error"
            ? `${styles.notice} ${styles.purchaseError}`
            : styles.notice
        }
        ref={feedback?.kind === "error" ? cartError : undefined}
        role={feedback?.kind === "error" ? "alert" : "status"}
        aria-live={feedback?.kind === "error" ? "assertive" : "polite"}
        tabIndex={feedback?.kind === "error" ? -1 : undefined}
      >
        {cartFeedbackText()}
      </p>

      {/*
        `aria-disabled`, jamais `disabled`. Un bouton nativement désactivé sort
        de l'ordre de tabulation, n'est pas annoncé par les lecteurs d'écran et
        n'émet aucun événement : le refus de vente devenait muet à l'instant
        exact où l'acheteur décide. Le refus se joue donc dans `onClick`, et
        `aria-describedby` rattache au bouton la phrase qui en donne la raison.

        Le libellé : commerce fermé, le bouton n'a aucune action à promettre.
        « Ajouter au panier » puis rien était un CTA qui promet ce qu'il ne rend
        pas ; « Sélectionnez une taille » envoyait même l'acheteur vers un geste
        sans issue. Le bouton nomme donc l'état réel. Les deux autres modes
        gardent leurs libellés d'achat, qui sont exacts.
      */}
      <button
        className={styles.purchaseButton}
        type="button"
        aria-disabled={purchaseBlocked}
        aria-describedby={NOTICE_ID}
        onClick={() => {
          if (purchaseBlocked) return;
          void addToCart();
        }}
        aria-busy={cartBusy}
      >
        {reviewMode
          ? `${t("product.reviewButton")} · ${formatPrice(
              AJ_APOLLON_PACK_PRICE_CENTS[selectedPackSize],
              locale,
            )}`
          : runtimeMode === "closed"
          ? t("product.openingSoon")
          : cartBusy
            ? t("product.adding")
            : selectedSize
              ? selectedPackSize === 1
                ? `${t("product.addDemo")} · ${formatPrice(
                    AJ_APOLLON_PACK_PRICE_CENTS[1],
                    locale,
                  )}`
                : `${t("product.addPack")
                    .replace("{count}", String(selectedPackSize))} · ${formatPrice(
                      AJ_APOLLON_PACK_PRICE_CENTS[selectedPackSize],
                      locale,
                    )}`
              : t("product.selectSizePrompt")}
      </button>

      {feedback?.kind === "success" && (
        <Link
          className={styles.cartLink}
          href="/cart"
        >
          {t("product.viewCart")}
        </Link>
      )}

      <div className={styles.details}>
        <details>
          <summary>{t("product.fullDescription")}</summary>
          <div className={styles.detailsContent}>
            {localizedProduct.details.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </details>

        <details>
          <summary>{t("product.features")}</summary>
          <div className={styles.detailsContent}>
            <ul className={styles.featureList}>
              {localizedProduct.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </div>
        </details>

      </div>

      <div className={styles.service}>
        <span>{reviewMode ? t("product.reviewShipping") : runtimeMode === "production" ? t("product.shippingCalculated") : t("product.shippingPending")}</span>
        <span>{reviewMode ? t("product.reviewPayment") : runtimeMode === "production" ? t("product.paymentByStripe") : t("product.paymentPending")}</span>
        <span>{reviewMode ? t("product.reviewPacks") : runtimeMode === "production" ? t("product.returnsAccordingTerms") : t("product.returnsPending")}</span>
      </div>
    </aside>
  );
}
