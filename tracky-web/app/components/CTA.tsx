"use client";

import { useReveal } from "../hooks/useReveal";

export function CTA() {
  const ctaRef = useReveal();

  return (
    <section id="cta" ref={ctaRef} className="py-32 px-6 text-center relative">
      <div className="mx-auto flex justify-center mb-6">
        <div className="w-[28px] h-24 relative">
          <div className="absolute top-0 bottom-0 left-[4px] w-[2px] bg-gradient-to-b from-transparent to-[#d4d4d4]" />
          <div className="absolute top-0 bottom-0 right-[4px] w-[2px] bg-gradient-to-b from-transparent to-[#d4d4d4]" />
        </div>
      </div>
      <div className="reveal max-w-xl mx-auto">
        <h2 className="text-3xl md:text-5xl font-bold mb-6" style={{ textWrap: "balance" }}>
          Your next ride starts with Tracky
        </h2>
        <p className="text-black/40 text-lg mb-10 leading-relaxed">Real-time tracking for every Amtrak train. Free to download.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href="#" className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-black text-white font-semibold text-sm transition-opacity hover:opacity-80">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            App Store
          </a>
          <a href="#" className="inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full border border-black/15 text-black font-semibold text-sm transition-all hover:bg-black/[0.03]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-1.4l2.834 1.64a1 1 0 0 1 0 1.726l-2.834 1.64-2.536-2.536 2.536-2.47zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z"/></svg>
            Google Play
          </a>
        </div>
      </div>
    </section>
  );
}
