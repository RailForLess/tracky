"use client";

import { useEffect, useRef } from "react";
import { useReveal } from "../hooks/useReveal";

export function Row({ side, children }: { side: "left" | "right"; children: React.ReactNode }) {
  const ref = useReveal();
  return (
    <div ref={ref} className="track-row">
      {side === "left" ? (
        <>
          <div className="track-left">{children}</div>
          <div />
          <div className="hidden md:block" />
        </>
      ) : (
        <>
          <div className="hidden md:block" />
          <div />
          <div className="track-right">{children}</div>
        </>
      )}
    </div>
  );
}

export function PairRow({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const revealed = useRef(false);

  useEffect(() => {
    const el = ref.current;
    const lEl = leftRef.current;
    const rEl = rightRef.current;
    if (!el || !lEl || !rEl) return;

    const revealChildren = el.querySelectorAll(".reveal");

    const apply = (el2: HTMLElement, tx: number, ty: number, rot: number, fade: number) => {
      el2.style.opacity = String(fade);
      el2.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg)`;
    };

    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const center = rect.top + rect.height / 2;
      const progress = 1 - center / vh;
      const mobile = window.innerWidth <= 768;

      if (rect.top > vh || rect.bottom < 0) {
        lEl.style.opacity = "0";
        rEl.style.opacity = "0";
        return;
      }

      if (!revealed.current && progress > 0.05) {
        revealed.current = true;
        revealChildren.forEach((c) => c.classList.add("visible"));
      }

      const lDir = mobile ? 1 : -1;
      const rDir = 1;

      if (progress < 0.35) {
        const t = Math.max(0, Math.min(1, (progress + 0.1) / 0.45));
        const eased = 1 - (1 - t) * (1 - t);
        const tx = (1 - eased) * 120;
        const ty = (1 - eased) * 60;
        const rot = (1 - eased) * 8;
        const fade = Math.min(1, t * 1.5);
        apply(lEl, -lDir * tx, ty, -lDir * rot, fade);
        apply(rEl, -rDir * tx, ty, -rDir * rot, fade);
        return;
      }

      if (progress < 0.75) {
        const drift = (progress - 0.35) / 0.4;
        const tx = drift * 5;
        const rot = drift * 1;
        apply(lEl, lDir * tx, 0, lDir * rot, 1);
        apply(rEl, rDir * tx, 0, rDir * rot, 1);
        return;
      }

      const exit = Math.min(1, (progress - 0.75) / 0.4);
      const eased = exit * exit;
      const tx = 5 + eased * 120;
      const ty = eased * -60;
      const rot = 1 + eased * 8;
      const fade = Math.max(0, 1 - exit * 1.5);
      apply(lEl, lDir * tx, ty, lDir * rot, fade);
      apply(rEl, rDir * tx, ty, rDir * rot, fade);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div ref={ref} className="track-row">
      <div className="track-left"><div ref={leftRef} style={{ opacity: 0, willChange: "transform, opacity" }}>{left}</div></div>
      <div />
      <div className="track-right"><div ref={rightRef} style={{ opacity: 0, willChange: "transform, opacity" }}>{right}</div></div>
    </div>
  );
}
