"use client";

/* eslint-disable @next/next/no-img-element -- source pixels are pre-optimized and client runtime cost is intentionally avoided */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { ProductMedia } from "@/lib/products";
import { useAjMotion } from "./useAjMotion";
import styles from "./ProductPage.module.css";

type ProductGalleryZoomProps = {
  images: ProductMedia[];
  model: string;
  color: string;
};

type DeferredGalleryMediaProps = {
  image: ProductMedia;
  alt: string;
  eager: boolean;
};

type AjScrollRevealProps = {
  className?: string;
  children: ReactNode;
};

/* ==========================================================================
   AjScrollReveal — la scène de révélation partagée par /shop et la fiche
   --------------------------------------------------------------------------
   Contrat par attributs de données, volontairement : les classes des CSS
   Modules sont hachées à la compilation, un composant de mouvement ne peut
   donc pas s'appuyer dessus.

     data-aj-reveal   le bloc monte et apparaît, groupé par ScrollTrigger.batch
     data-aj-para     le média glisse en parallaxe, au scrub
     data-aj-presse   le relais vers la fiche : la carte s'enfonce sous le doigt
     data-aj-arrivee  l'atterrissage sur la fiche : le filet d'accent se retrace

   Les deux derniers portent la TRANSITION VERS LA FICHE. Elle est faite de
   deux moitiés qui se répondent, et d'aucun écran de chargement :
   — au départ, la carte cliquée s'enfonce de 1,2 % ; le filet d'accent qui
     court sous elle est la dernière chose que l'œil garde ;
   — à l'arrivée, ce même filet, dans cette même couleur de tissu, se retrace
     en haut de l'image principale de la fiche, puis s'efface.
   Rien n'intercepte le clic : <Link> préchargé navigue comme d'habitude, le
   bouton « précédent » se comporte normalement, et si GSAP n'arrive jamais la
   navigation reste exactement celle du HTML.

   Deux règles tenues ici :
   — l'état de départ est posé en JS (gsap.set), jamais en CSS : sans JS, ou
     sous prefers-reduced-motion, la page est déjà lisible et complète ;
   — on n'anime que transform et opacity, donc rien ne déclenche de layout.

   NOTE D'IMPLANTATION — ce composant appartient conceptuellement à la
   boutique, pas à la galerie. Il vit ici parce que la répartition des
   fichiers de cette session ne m'ouvrait pas de nouveau module client ;
   `app/shop/page.tsx` doit rester un composant serveur pour conserver son
   `export const metadata`. Le déplacer vers un fichier dédié est un simple
   déplacement de bloc, sans changement d'API.
   ========================================================================== */
export function AjScrollReveal({ className, children }: AjScrollRevealProps) {
  const racine = useAjMotion<HTMLDivElement>(
    ({ gsap, ScrollTrigger, racine: noeud, mm }) => {
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        /*
         * GSAP arrive par import dynamique : au moment où ce réglage
         * s'exécute, la page est déjà peinte. Masquer un bloc DÉJÀ VISIBLE
         * pour le refaire apparaître produirait un clignotement — sur la
         * fiche produit, ce serait le prix qui clignoterait. On ne pose donc
         * l'état de départ que sur ce qui est encore sous la ligne de
         * flottaison ; le reste est laissé tel qu'il a été peint.
         */
        const seuil = window.innerHeight * 0.92;
        const blocs = Array.from(
          noeud.querySelectorAll<HTMLElement>("[data-aj-reveal]"),
        ).filter((bloc) => bloc.getBoundingClientRect().top > seuil);

        if (blocs.length > 0) {
          gsap.set(blocs, { autoAlpha: 0, y: 28 });
          ScrollTrigger.batch(blocs, {
            start: "top 92%",
            once: true,
            onEnter: (lot) => {
              gsap.to(lot, {
                autoAlpha: 1,
                y: 0,
                duration: 0.75,
                stagger: 0.09,
                // expo.out est l'équivalent GSAP le plus proche de --e1
                // (cubic-bezier(.16,1,.3,1)) : sortie très longue, arrivée
                // sans rebond.
                ease: "expo.out",
                overwrite: true,
              });
            },
          });
        }

        for (const media of noeud.querySelectorAll<HTMLElement>(
          "[data-aj-para]",
        )) {
          gsap.fromTo(
            media,
            { yPercent: -4 },
            {
              yPercent: 4,
              ease: "none",
              scrollTrigger: {
                trigger: media,
                start: "top bottom",
                end: "bottom top",
                scrub: 0.6,
                invalidateOnRefresh: true,
              },
            },
          );
        }

        /* ------------------------------------------------------------------
           Le relais — moitié « départ », sur /shop.
           La carte s'enfonce sous le doigt et se relève au relâchement. On
           n'écrit que sur .carteLien : le zoom de survol vit sur l'enfant
           .carteMedia, en CSS, les deux transforms ne se disputent donc rien.
           pointercancel est ce qui sauve le tactile — il part dès que le doigt
           devient un défilement, la carte se relève et rien ne bloque le
           scroll.
           ------------------------------------------------------------------ */
        const defaire: Array<() => void> = [];

        for (const carte of noeud.querySelectorAll<HTMLElement>(
          "[data-aj-presse]",
        )) {
          const enfoncer = () => {
            gsap.to(carte, {
              scale: 0.988,
              duration: 0.32,
              ease: "power3.out",
              overwrite: "auto",
            });
          };
          const relever = () => {
            gsap.to(carte, {
              scale: 1,
              duration: 0.75,
              // expo.out : l'équivalent GSAP le plus proche de --e1.
              ease: "expo.out",
              overwrite: "auto",
            });
          };

          carte.addEventListener("pointerdown", enfoncer);
          carte.addEventListener("pointerup", relever);
          carte.addEventListener("pointercancel", relever);
          carte.addEventListener("pointerleave", relever);

          defaire.push(() => {
            carte.removeEventListener("pointerdown", enfoncer);
            carte.removeEventListener("pointerup", relever);
            carte.removeEventListener("pointercancel", relever);
            carte.removeEventListener("pointerleave", relever);
            gsap.killTweensOf(carte);
            gsap.set(carte, { clearProps: "transform" });
          });
        }

        /* ------------------------------------------------------------------
           Le relais — moitié « arrivée », sur la fiche.
           Le filet est CRÉÉ ici, il n'existe pas dans le HTML : il ne peut
           donc rien masquer ni faire clignoter, quel que soit le moment où
           GSAP finit de se charger. C'est la seule façon d'animer quelque
           chose au-dessus de la ligne de flottaison sans risquer de reprendre
           au lecteur un contenu qu'il voit déjà.
           La couleur descend de --pdp-accent, c'est-à-dire du swatch produit :
           jamais une couleur inventée.
           ------------------------------------------------------------------ */
        for (const cadre of noeud.querySelectorAll<HTMLElement>(
          "[data-aj-arrivee]",
        )) {
          const filet = document.createElement("span");
          filet.setAttribute("aria-hidden", "true");
          filet.style.cssText =
            "position:absolute;z-index:4;top:0;right:0;left:0;height:2px;" +
            "background:var(--pdp-accent,#fff);transform:scaleX(0);" +
            "transform-origin:left center;pointer-events:none;will-change:transform";
          cadre.appendChild(filet);

          const trace = gsap
            .timeline({ onComplete: () => filet.remove() })
            .to(filet, { scaleX: 1, duration: 0.9, ease: "expo.out" })
            .to(filet, { autoAlpha: 0, duration: 0.5, ease: "power2.out" }, ">-0.15");

          defaire.push(() => {
            trace.kill();
            filet.remove();
          });
        }

        // Rendue à matchMedia : GSAP l'appelle quand la requête cesse de
        // correspondre, et au revert du contexte. gsap.context() ne sait pas
        // défaire un addEventListener ni un nœud ajouté à la main.
        return () => {
          for (const nettoyer of defaire) nettoyer();
        };
      });
    },
  );

  return (
    <div className={className} ref={racine}>
      {children}
    </div>
  );
}

function galleryPlaceholderSrc(src: string): string {
  return `${src.replace(/\.[^.]+$/, "-placeholder-v1.webp")}?v=v1`;
}

function DeferredGalleryMedia({
  image,
  alt,
  eager,
}: DeferredGalleryMediaProps) {
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(eager);
  const [criticalPathComplete, setCriticalPathComplete] = useState(eager);

  useEffect(() => {
    if (eager) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    if (!("IntersectionObserver" in window)) {
      const fallbackHandle = globalThis.setTimeout(() => setVisible(true), 0);
      return () => globalThis.clearTimeout(fallbackHandle);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "320px 0px", threshold: 0.01 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [eager]);

  useEffect(() => {
    if (eager) return;

    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
    const interactionEvents: Array<keyof WindowEventMap> = [
      "wheel",
      "touchstart",
      "pointerdown",
      "keydown",
    ];

    const unlock = () => setCriticalPathComplete(true);
    const removeInteractionListeners = () => {
      for (const eventName of interactionEvents) {
        window.removeEventListener(eventName, unlockFromIntent);
      }
    };
    const unlockFromIntent = () => {
      removeInteractionListeners();
      unlock();
    };
    const scheduleUnlock = () => {
      if ("requestIdleCallback" in window) {
        idleHandle = window.requestIdleCallback(unlock, { timeout: 1200 });
        return;
      }
      timeoutHandle = globalThis.setTimeout(unlock, 200);
    };

    for (const eventName of interactionEvents) {
      window.addEventListener(eventName, unlockFromIntent, {
        once: true,
        passive: eventName !== "keydown",
      });
    }
    if (document.readyState === "complete") scheduleUnlock();
    else window.addEventListener("load", scheduleUnlock, { once: true });

    return () => {
      window.removeEventListener("load", scheduleUnlock);
      removeInteractionListeners();
      if (idleHandle !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) globalThis.clearTimeout(timeoutHandle);
    };
  }, [eager]);

  const ready = eager || (visible && criticalPathComplete);

  return (
    <>
      <span
        ref={sentinelRef}
        className={styles.galleryMediaSentinel}
        aria-hidden="true"
      />
      {ready ? (
        <img
          className={styles.galleryMedia}
          data-gallery-media="full"
          src={image.src}
          alt={alt}
          width={1600}
          height={2400}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "low"}
          decoding="async"
          sizes="(max-width: 560px) 100vw, (max-width: 900px) 50vw, 32vw"
          style={
            image.objectPosition
              ? { objectPosition: image.objectPosition }
              : undefined
          }
        />
      ) : null}
      <img
        className={styles.galleryPlaceholder}
        data-gallery-media="placeholder"
        src={galleryPlaceholderSrc(image.src)}
        alt=""
        aria-hidden="true"
        width={48}
        height={72}
        loading={eager ? "eager" : "lazy"}
        fetchPriority="low"
        decoding="async"
        sizes="(max-width: 560px) 100vw, (max-width: 900px) 50vw, 32vw"
        style={
          image.objectPosition
            ? { objectPosition: image.objectPosition }
            : undefined
        }
      />
    </>
  );
}

export default function ProductGalleryZoom({
  images,
  model,
  color,
}: ProductGalleryZoomProps) {
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const zoomSurfaceRef = useRef<HTMLDivElement>(null);
  const zoomMediaRef = useRef<HTMLImageElement>(null);
  const isOpen = zoomedIndex !== null;

  function getFrameClass(image: ProductMedia) {
    if (image.frame === "main") return styles.galleryMain;
    if (image.frame === "landscape") return styles.galleryLandscape;
    return styles.galleryPortrait;
  }

  function getImageAlt(image: ProductMedia, index: number) {
    if (image.src.includes("editorial-pourpre-chair")) {
      return `Jérémy — ${model} ${color}`;
    }

    return index === 0
      ? `${model} ${color} ${t("product.wornByModel")}`
      : `${t("product.view")} ${index + 1} · ${model} ${color}`;
  }

  function renderFigure(image: ProductMedia, index: number) {
    return (
      <figure
        className={`${styles.galleryItem} ${getFrameClass(image)}`}
        key={image.src}
        data-aj-reveal
        /* Seule la première vue reçoit le filet d'arrivée : c'est elle qui
           occupe la place qu'occupait la carte cliquée. */
        data-aj-arrivee={index === 0 ? "" : undefined}
      >
        <button
          className={styles.zoomTrigger}
          type="button"
          onClick={(event) => {
            lastTriggerRef.current = event.currentTarget;
            setZoomedIndex(index);
          }}
          aria-label={`${t("product.enlargeView")} ${index + 1} · ${model} ${color}`}
        >
          <DeferredGalleryMedia
            image={image}
            alt={getImageAlt(image, index)}
            eager={index === 0}
          />
          <span className={styles.zoomLabel} aria-hidden="true">
            {t("product.enlarge")}
          </span>
        </button>
      </figure>
    );
  }

  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLButtonElement>("button");
    focusable?.[0]?.focus();

    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setZoomedIndex(null);
        return;
      }

      if (event.key === "ArrowLeft") {
        setZoomedIndex((current) =>
          current === null ? null : (current - 1 + images.length) % images.length,
        );
        return;
      }

      if (event.key === "ArrowRight") {
        setZoomedIndex((current) =>
          current === null ? null : (current + 1) % images.length,
        );
        return;
      }

      if (event.key !== "Tab" || !focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.classList.add("is-gallery-zoomed");
    window.addEventListener("keydown", handleKeyboard);

    return () => {
      document.body.classList.remove("is-gallery-zoomed");
      window.removeEventListener("keydown", handleKeyboard);
      lastTriggerRef.current?.focus();
    };
  }, [images.length, isOpen]);

  /* ------------------------------------------------------------------------
     La loupe de la vue agrandie.
     L'image est déjà cadrée en `contain` : le zoom n'est donc pas une béquille
     de lisibilité mais un examen du tissu — la maille du modal et le jacquard
     de la ceinture. Il ne touche que `transform`, piloté par gsap.quickTo :
     un seul tween réutilisé par propriété, donc aucune allocation par
     pointermove et rien qui recalcule le layout.

     Réservé au pointeur fin : sur écran tactile il n'existe pas d'état de
     survol, et un zoom collé au doigt masquerait la zone observée. Le cadre
     est mesuré à l'entrée puis au redimensionnement, jamais à chaque
     déplacement.
     ------------------------------------------------------------------------ */
  useEffect(() => {
    if (!isOpen) return;

    const surface = zoomSurfaceRef.current;
    const media = zoomMediaRef.current;
    if (!surface || !media) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let annule = false;
    let detacher: (() => void) | undefined;

    void import("gsap").then(({ default: gsap }) => {
      if (annule) return;

      const reduit = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const ZOOM = 1.85;
      const suivreX = gsap.quickTo(media, "x", {
        duration: reduit ? 0 : 0.55,
        ease: "power3",
      });
      const suivreY = gsap.quickTo(media, "y", {
        duration: reduit ? 0 : 0.55,
        ease: "power3",
      });
      const echelle = gsap.quickTo(media, "scale", {
        duration: reduit ? 0 : 0.7,
        ease: "power3",
      });

      let cadre = surface.getBoundingClientRect();
      const remesurer = () => {
        cadre = surface.getBoundingClientRect();
      };

      const suivre = (event: PointerEvent) => {
        if (cadre.width === 0 || cadre.height === 0) return;
        const versLaDroite = (event.clientX - cadre.left) / cadre.width - 0.5;
        const versLeBas = (event.clientY - cadre.top) / cadre.height - 0.5;
        echelle(ZOOM);
        suivreX(-versLaDroite * cadre.width * (ZOOM - 1));
        suivreY(-versLeBas * cadre.height * (ZOOM - 1));
      };

      const relacher = () => {
        echelle(1);
        suivreX(0);
        suivreY(0);
      };

      surface.addEventListener("pointerenter", remesurer);
      surface.addEventListener("pointermove", suivre);
      surface.addEventListener("pointerleave", relacher);
      window.addEventListener("resize", remesurer);

      detacher = () => {
        surface.removeEventListener("pointerenter", remesurer);
        surface.removeEventListener("pointermove", suivre);
        surface.removeEventListener("pointerleave", relacher);
        window.removeEventListener("resize", remesurer);
        gsap.killTweensOf(media);
        gsap.set(media, { x: 0, y: 0, scale: 1 });
      };
    });

    return () => {
      annule = true;
      detacher?.();
    };
  }, [isOpen, zoomedIndex]);

  return (
    <>
      <div
        className={styles.gallery}
        aria-label={`${t("product.gallery")} ${color}`}
      >
        {images[0] ? renderFigure(images[0], 0) : null}
        <div className={styles.gallerySecondary}>
          {images.slice(1).map((image, index) => renderFigure(image, index + 1))}
        </div>
      </div>

      {zoomedIndex !== null && (
        <div
          className={styles.zoomOverlay}
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${t("product.zoomedView")} · ${model} ${color}`}
        >
          <button
            className={styles.zoomClose}
            type="button"
            onClick={() => setZoomedIndex(null)}
          >
            {t("product.close")}
          </button>

          <div className={styles.zoomImage} ref={zoomSurfaceRef}>
            <img
              ref={zoomMediaRef}
              src={images[zoomedIndex].src}
              alt={`${t("product.zoomedView")} ${zoomedIndex + 1} · ${model} ${color}`}
              width={1600}
              height={2400}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              sizes="100vw"
            />
          </div>

          <div className={styles.zoomControls}>
            <button
              type="button"
              onClick={() =>
                setZoomedIndex((zoomedIndex - 1 + images.length) % images.length)
              }
              aria-label={t("product.previous")}
            >
              ←
            </button>
            <span>
              {String(zoomedIndex + 1).padStart(2, "0")} /{" "}
              {String(images.length).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={() => setZoomedIndex((zoomedIndex + 1) % images.length)}
              aria-label={t("product.next")}
            >
              →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
