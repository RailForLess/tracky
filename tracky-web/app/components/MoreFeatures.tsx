"use client";

import { useReveal } from "../hooks/useReveal";

export function MoreFeatures() {
  const moreRef = useReveal();

  return (
    <section ref={moreRef} className="py-24 px-6 max-w-5xl mx-auto">
      <h2 className="reveal text-3xl md:text-4xl font-bold text-center mb-16">And so much more.</h2>
      <div className="grid md:grid-cols-3 gap-5">
        {[
          { t: "iOS Live Activity", d: "Glanceable train status on your lock screen and Dynamic Island." },
          { t: "Calendar sync", d: "Scan your calendar for Amtrak trips and auto-import them." },
          { t: "Share trips", d: "Share completed trips as beautiful ticket art images." },
          { t: "Map views", d: "Toggle satellite and standard. See your GPS location alongside trains." },
          { t: "Smart clustering", d: "Hundreds of stations that cluster and uncluster as you zoom." },
          { t: "Privacy first", d: "Your saved trains and travel history stay on your device." },
        ].map((f, i) => (
          <div key={i} className="reveal feat-card" style={{ transitionDelay: `${i * 50}ms` }}>
            <h3 className="text-base font-semibold mb-1.5">{f.t}</h3>
            <p className="text-black/40 text-sm leading-relaxed">{f.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
