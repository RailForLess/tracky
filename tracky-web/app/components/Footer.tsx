"use client";

import { RefObject, useEffect } from "react";

export function Footer({ footerRef }: { footerRef: RefObject<HTMLElement | null> }) {
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) el.querySelectorAll(".logo-enter").forEach((c) => c.classList.add("visible"));
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [footerRef]);

  return (
    <footer ref={footerRef} className="border-t border-black/8 pt-16 pb-10 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-14">
          <div className="col-span-2 md:col-span-1">
            <div className="logo-enter flex items-center gap-2.5 mb-2">
              <img src="/tracky-logo.png" alt="Tracky" className="w-9 h-9 rounded-xl" />
              <p className="text-lg font-bold">Tracky</p>
            </div>
            <p className="text-black/40 text-sm leading-relaxed">Real-time Amtrak tracking for iOS&nbsp;&amp;&nbsp;Android.</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-black/30 mb-3">Product</p>
            <ul className="space-y-2 text-sm text-black/50">
              <li><a href="#preflight" className="hover:text-black transition-colors">Search &amp; Save</a></li>
              <li><a href="#departure-board" className="hover:text-black transition-colors">Departure Boards</a></li>
              <li><a href="#live-map" className="hover:text-black transition-colors">Live Map</a></li>
              <li><a href="#en-route" className="hover:text-black transition-colors">Train Tracking</a></li>
              <li><a href="#arrived" className="hover:text-black transition-colors">Travel History</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-black/30 mb-3">Resources</p>
            <ul className="space-y-2 text-sm text-black/50">
              <li><a href="#" className="hover:text-black transition-colors">About</a></li>
              <li><a href="#" className="hover:text-black transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-black transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-black transition-colors">Contact</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-black/30 mb-3">Download</p>
            <ul className="space-y-2 text-sm text-black/50">
              <li><a href="#" className="hover:text-black transition-colors">App Store</a></li>
              <li><a href="#" className="hover:text-black transition-colors">Google Play</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-black/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-black/25">CC-BY-NC &middot; {new Date().getFullYear()} Tracky</p>
          <div className="flex items-center gap-5">
            <a href="https://github.com/Mootbing/Tracky" target="_blank" rel="noopener noreferrer" className="text-black/20 hover:text-black transition-colors" aria-label="GitHub">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
