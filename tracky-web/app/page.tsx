"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTypewriter } from "./hooks/useTypewriter";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { BulletTrain } from "./components/BulletTrain";
import { TrackSection } from "./components/TrackSection";
import { Stats } from "./components/Stats";
import { MoreFeatures } from "./components/MoreFeatures";
import { CTA } from "./components/CTA";
import { Footer } from "./components/Footer";

export default function Home() {
  const trackRef = useRef<HTMLElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);

  const [statsGo, setStatsGo] = useState(false);
  const [trainVisible, setTrainVisible] = useState(false);
  const [scrollingUp, setScrollingUp] = useState(false);
  const [trainReveal, setTrainReveal] = useState(0);
  const [tunnelProgress, setTunnelProgress] = useState(0);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [headerCompact, setHeaderCompact] = useState(false);

  /* ---- Intro sequence ---- */
  const [introStage, setIntroStage] = useState(0);
  const { displayed: titleText, done: titleDone } = useTypewriter("From 'Where's My Train?' To 'Wow that's quick'", 300, 25);

  useEffect(() => { setIntroStage(1); }, []);

  useEffect(() => {
    if (titleDone) {
      const t1 = setTimeout(() => setIntroStage(2), 200);
      const t2 = setTimeout(() => setIntroStage(3), 900);
      const t3 = setTimeout(() => setIntroStage(4), 1600);
      const t4 = setTimeout(() => setIntroStage(5), 2800);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
    }
  }, [titleDone]);

  /* ---- Scroll handler ---- */
  const handleScroll = useCallback(() => {
    const section = trackRef.current;
    if (!section) return;
    const rect = section.getBoundingClientRect();
    const vh = window.innerHeight;
    setTrainVisible(rect.top < vh && rect.bottom > 0);

    const y = window.scrollY;
    setScrollingUp(y < lastScrollY.current);
    if (y > 50) setHasScrolled(true);
    setHeaderCompact(y > 50);
    lastScrollY.current = y;

    const notif = notifRef.current;
    if (notif) {
      const nr = notif.getBoundingClientRect();
      const notifCenter = nr.top + nr.height / 2;
      const p = Math.max(0, Math.min(1, (vh / 2 - notifCenter + 100) / (vh * 1)));
      setTrainReveal(p);
    }

    const distFromBottom = rect.bottom + 250;
    const tp = Math.max(0, Math.min(1, 1 - distFromBottom / (vh * 1)));
    setTunnelProgress(tp);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStatsGo(true); }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <main className="bg-white min-h-screen">
      <Header introStage={introStage} headerCompact={headerCompact} />

      {trainVisible && (
        <div className="scroll-train">
          <BulletTrain reverse={scrollingUp} revealProgress={trainReveal} tunnelProgress={tunnelProgress} />
        </div>
      )}

      <Hero
        titleText={titleText}
        titleDone={titleDone}
        introStage={introStage}
        hasScrolled={hasScrolled}
        notifRef={notifRef}
      />

      <TrackSection trackRef={trackRef} />

      {/* Tunnel at end of track */}
      <div className="relative flex justify-center -mt-12" style={{ zIndex: 11 }}>
        <div className="tunnel-end" style={{
          transform: `scale(${tunnelProgress > 0.01 ? 1 + 0.3 * Math.exp(-((tunnelProgress * 11) % 1) * 4) : 1})`,
          transition: "transform 0.1s ease-out",
        }} />
      </div>

      {/* White cover to hide train overshooting past tunnel */}
      <div className="relative bg-white" style={{ zIndex: 11 }}>
        <Stats statsRef={statsRef} tunnelProgress={tunnelProgress} />
        <MoreFeatures />
        <CTA />
        <Footer footerRef={footerRef} />
      </div>
    </main>
  );
}
