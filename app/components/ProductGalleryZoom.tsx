"use client";

/* eslint-disable @next/next/no-img-element -- source pixels are pre-optimized and client runtime cost is intentionally avoided */

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { ProductMedia } from "@/lib/products";
import styles from "./ProductPage.module.css";

type ProductGalleryZoomProps = {
  images: readonly ProductMedia[];
  model: string;
  color: string;
};

type DeferredGalleryMediaProps = {
  image: ProductMedia;
  alt: string;
  eager: boolean;
};

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

          <div className={styles.zoomImage}>
            <img
              src={images[zoomedIndex].src}
              alt={`${t("product.zoomedView")} ${zoomedIndex + 1} · ${model} ${color}`}
              width={1600}
              height={2400}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              sizes="100vw"
              style={{ objectFit: "contain" }}
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
