"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type {
  MetallicFieldMotion,
  MetallicFieldVariant,
} from "./MetallicField";

const MetallicField = lazy(() => import("./MetallicField"));

type DeferredMetallicFieldProps = {
  className?: string;
  motion?: MetallicFieldMotion;
  variant?: MetallicFieldVariant;
};

function metallicFallback(variant: MetallicFieldVariant) {
  return variant === "reference"
    ? [
        "radial-gradient(circle at 12% 32%, rgba(238,238,239,.88) 0 3%, rgba(82,82,86,.58) 7%, transparent 13%)",
        "radial-gradient(circle at 88% 68%, rgba(230,230,232,.74) 0 5%, rgba(62,62,67,.68) 10%, transparent 18%)",
        "linear-gradient(132deg, transparent 0 15%, rgba(222,222,225,.5) 34%, rgba(78,78,84,.58) 52%, rgba(207,207,210,.44) 68%, transparent 86%)",
        "linear-gradient(42deg, #09090b 0%, #29292d 28%, #747478 48%, #a9a9ac 58%, #36363b 75%, #0b0b0d 100%)",
      ].join(",")
    : [
        "linear-gradient(132deg, transparent 0 20%, rgba(197,198,204,.42) 38%, rgba(103,103,112,.36) 54%, transparent 70%)",
        "linear-gradient(42deg, #121217 0%, #393940 30%, #898990 48%, #b8b8bd 57%, #55545d 72%, #17171c 100%)",
      ].join(",");
}

export default function DeferredMetallicField({
  className = "",
  motion = "normal",
  variant = "graphite",
}: DeferredMetallicFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (typeof IntersectionObserver === "undefined") {
      const fallbackMount = window.setTimeout(() => setReady(true), 0);
      return () => window.clearTimeout(fallbackMount);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setReady(true);
        observer.disconnect();
      },
      { rootMargin: "0px", threshold: 0.01 },
    );
    observer.observe(host);

    return () => observer.disconnect();
  }, []);

  const fallback = (
    <div
      ref={hostRef}
      className={`metallic-field ${className}`.trim()}
      style={{ background: metallicFallback(variant) }}
      data-metallic-mounted="false"
      aria-hidden="true"
    />
  );

  if (!ready) return fallback;

  return (
    <Suspense fallback={fallback}>
      <MetallicField
        className={className}
        motion={motion}
        variant={variant}
      />
    </Suspense>
  );
}
