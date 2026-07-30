"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import styles from "./ProductPage.module.css";

type ProductGalleryZoomProps = {
  images: string[];
  model: string;
  color: string;
};

export default function ProductGalleryZoom({
  images,
  model,
  color,
}: ProductGalleryZoomProps) {
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const isOpen = zoomedIndex !== null;

  function getFrameClass(image: string, index: number) {
    if (index === 0) return styles.galleryMain;
    if (image.includes("product-rose-detail")) return styles.galleryLandscape;
    if (image.includes("product-rose-front")) return styles.galleryPortraitWide;
    return "";
  }

  function getImageAlt(image: string, index: number) {
    if (image.includes("editorial-pourpre-chair")) {
      return `Jérémy portant ${model} ${color}`;
    }

    return index === 0
      ? `${model} ${color} ${t("product.wornByModel")}`
      : `${t("product.view")} ${index + 1} · ${model} ${color}`;
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
      <div className={styles.gallery} aria-label={`${t("product.gallery")} ${color}`}>
        {images.map((image, index) => (
          <figure
            className={`${styles.galleryItem} ${getFrameClass(image, index)}`}
            key={image}
          >
            <button
              className={styles.zoomTrigger}
              type="button"
              ref={(node) => {
                triggerRefs.current[index] = node;
              }}
              onClick={() => {
                lastTriggerRef.current = triggerRefs.current[index];
                setZoomedIndex(index);
              }}
              aria-label={`${t("product.enlargeView")} ${index + 1} · ${model} ${color}`}
              >
              <Image
                unoptimized
                src={image}
                alt={getImageAlt(image, index)}
                fill
                priority={index === 0}
                sizes="(max-width: 900px) 100vw, 32vw"
              />
              <span className={styles.zoomLabel} aria-hidden="true">
                {t("product.enlarge")}
              </span>
            </button>
          </figure>
        ))}
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
            <Image
              unoptimized
              src={images[zoomedIndex]}
              alt={`${t("product.zoomedView")} ${zoomedIndex + 1} · ${model} ${color}`}
              fill
              sizes="100vw"
              priority
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
