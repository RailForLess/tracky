"use client";

import { RefObject } from "react";

export function Stats({ statsRef, tunnelProgress }: { statsRef: RefObject<HTMLDivElement | null>; tunnelProgress: number }) {
  return (
    <section ref={statsRef} className="py-24 px-6">
      <div className="max-w-3xl mx-auto grid grid-cols-3 gap-8 text-center">
        {[
          { v: tunnelProgress > 0.3 ? 47 : 46, s: "", l: "Trips" },
          { v: 12849 + Math.round(tunnelProgress * 457), s: " mi", l: "Distance" },
          { v: 186 + Math.round(tunnelProgress * 7), s: " hr", l: "On Rails" },
        ].map((d) => (
          <div key={d.l}>
            <p className="text-4xl md:text-5xl font-bold whitespace-nowrap"><span className="font-mono tabular-nums">{d.v.toLocaleString()}{d.s}</span></p>
            <p className="text-black/25 text-xs uppercase tracking-widest mt-2 whitespace-nowrap">{d.l}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
