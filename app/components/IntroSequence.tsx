"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import MetallicField from "./MetallicField";

const STORAGE_KEY = "aj-luxury-intro-seen";

export default function IntroSequence() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const forceReplay = new URLSearchParams(window.location.search).has("intro");
    const seen = window.sessionStorage.getItem(STORAGE_KEY);
    if (forceReplay || !seen) {
      const revealTimer = window.setTimeout(() => setVisible(true), 0);
      const timer = window.setTimeout(() => {
        setVisible(false);
        window.sessionStorage.setItem(STORAGE_KEY, "1");
      }, 3800);
      return () => {
        window.clearTimeout(revealTimer);
        window.clearTimeout(timer);
      };
    }
  }, []);

  function close() {
    setVisible(false);
    window.sessionStorage.setItem(STORAGE_KEY, "1");
  }

  function replay() {
    setVisible(true);
    window.setTimeout(close, 3800);
  }

  return (
    <>
      {visible && (
        <div className="intro" aria-label="Introduction AJ Luxury">
          <MetallicField className="intro__field" />
          <div className="intro__glow" />
          <Image
            unoptimized
            className="intro__logo"
            src="/images/aj-luxury-logo.webp"
            alt="AJ Luxury"
            width={720}
            height={520}
            priority
          />
          <p className="intro__tagline">Reveal Your Inner Beauty</p>
          <button type="button" className="intro__skip" onClick={close}>
            Passer
          </button>
        </div>
      )}
      <button type="button" className="intro-replay" onClick={replay}>
        Revoir l’introduction
      </button>
    </>
  );
}
