"use client";

import { RefObject } from "react";
import { useReveal } from "../hooks/useReveal";
import { Notif } from "./Notif";

export function Hero({
  titleText,
  titleDone,
  introStage,
  hasScrolled,
  notifRef,
}: {
  titleText: string;
  titleDone: boolean;
  introStage: number;
  hasScrolled: boolean;
  notifRef: RefObject<HTMLDivElement | null>;
}) {
  const heroRef = useReveal();

  return (
    <section ref={heroRef} className="relative flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[1.05] max-w-3xl mb-2" style={{
        textWrap: "balance",
        filter: titleDone ? "blur(0px)" : "blur(4px)",
        transition: "filter 0.6s ease",
      }}>
        {titleText}
      </h1>
      <p className="text-black/45 text-lg md:text-xl max-w-xl mt-2 leading-relaxed" style={{
        textWrap: "balance",
        transition: "opacity 0.7s ease, transform 0.7s ease, filter 0.7s ease",
        opacity: introStage >= 2 ? 1 : 0,
        transform: introStage >= 2 ? "translateY(0)" : "translateY(10px)",
        filter: introStage >= 2 ? "blur(0px)" : "blur(6px)",
      }}>
        The only app that tells you everything about your train. Live map, real-time
        delays, departure boards, and weather&nbsp;&mdash; so you&apos;re always first to know.
      </p>
      <div ref={notifRef} className="mt-12 w-full max-w-md px-4 relative z-[11]" style={{
        transition: "opacity 0.6s ease, transform 0.6s ease",
        opacity: introStage >= 3 ? 1 : 0,
        transform: introStage >= 3 ? "translateY(0)" : "translateY(20px)",
      }}>
        <div className="relative">
          <div style={{
            transition: "opacity 0.6s ease, transform 0.6s ease",
            opacity: hasScrolled ? 0.45 : 1,
            transform: hasScrolled ? "translateY(-18px) scale(0.92)" : "translateY(0) scale(1)",
            transformOrigin: "top center",
            pointerEvents: hasScrolled ? "none" : "auto",
          }}>
            <Notif title="Acela 2151 — Delayed 12m" body="New departure 6:17 AM from BOS. Late inbound equipment." time="5:48 AM" />
          </div>
          <div className="absolute inset-0" style={{
            transition: "opacity 0.5s ease 0.15s, transform 0.5s ease 0.15s",
            opacity: hasScrolled ? 1 : 0,
            transform: hasScrolled ? "translateY(0)" : "translateY(12px)",
          }}>
            <Notif title="Acela 2151 — Now On Time" body="Schedule restored. Departing 6:05 AM from BOS as planned." time="5:52 AM" />
          </div>
        </div>
      </div>
      {/* Track fading up into the notification */}
      <div className="hero-track-leadin" style={{
        opacity: introStage >= 4 ? 1 : 0,
      }}>
        <div className="absolute top-0 bottom-0 left-0 right-0 overflow-hidden">
          {Array.from({ length: 18 }, (_, i) => (
            <div key={i} className="absolute left-0 right-0 h-[2px]" style={{
              top: `${18 + i * 20}px`,
              background: "#a0674e",
              transition: `opacity 0.3s ease ${i * 40}ms, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${i * 40}ms`,
              opacity: introStage >= 4 ? 1 : 0,
              transform: introStage >= 4 ? "scaleX(1)" : "scaleX(0)",
              transformOrigin: "left center",
            }} />
          ))}
        </div>
        <div className="absolute top-0 bottom-0 left-[2px] w-[2px] bg-[#d4d4d4]" style={{
          transition: "clip-path 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.6s",
          clipPath: introStage >= 4 ? "inset(0 0 0 0)" : "inset(0 0 100% 0)",
        }} />
        <div className="absolute top-0 bottom-0 right-[2px] w-[2px] bg-[#d4d4d4]" style={{
          transition: "clip-path 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.7s",
          clipPath: introStage >= 4 ? "inset(0 0 0 0)" : "inset(0 0 100% 0)",
        }} />
      </div>
    </section>
  );
}
