"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const isOpen = zoomedIndex !== null;

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
  }, [isOpen]);

  return (
    <>
      <div className="product-gallery" aria-label={`Galerie ${color}`}>
        {images.map((image, index) => (
          <figure
            className={index === 0 ? "product-gallery__main" : ""}
            key={image}
          >
            <button
              className="product-gallery__zoom-trigger"
              type="button"
              ref={(node) => {
                triggerRefs.current[index] = node;
              }}
              onClick={() => {
                lastTriggerRef.current = triggerRefs.current[index];
                setZoomedIndex(index);
              }}
              aria-label={`Agrandir la vue ${index + 1} du ${model} ${color}`}
            >
              <Image
                unoptimized
                src={image}
                alt={
                  index === 0
                    ? `${model} ${color} porté par un mannequin adulte`
                    : `Vue ${index + 1} du ${model} ${color}`
                }
                fill
                priority={index === 0}
                sizes="(max-width: 900px) 100vw, 32vw"
              />
              <span aria-hidden="true">Agrandir</span>
            </button>
          </figure>
        ))}
      </div>

      {zoomedIndex !== null && (
        <div
          className="product-zoom"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Vue agrandie du ${model} ${color}`}
        >
          <button
            className="product-zoom__close"
            type="button"
            onClick={() => setZoomedIndex(null)}
          >
            Fermer
          </button>

          <div className="product-zoom__image">
            <Image
              unoptimized
              src={images[zoomedIndex]}
              alt={`Vue agrandie ${zoomedIndex + 1} du ${model} ${color}`}
              fill
              sizes="100vw"
              priority
            />
          </div>

          <div className="product-zoom__controls">
            <button
              type="button"
              onClick={() =>
                setZoomedIndex((zoomedIndex - 1 + images.length) % images.length)
              }
              aria-label="Vue précédente"
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
              aria-label="Vue suivante"
            >
              →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
