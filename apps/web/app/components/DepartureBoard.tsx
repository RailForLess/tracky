"use client";

import { useEffect, useState } from "react";

type Train = { n: string; r: string; t: string; s: string; c: string; hl?: boolean };

const INITIAL: Train[] = [
  { n: "171",  r: "NE Regional", t: "6:10 AM", s: "On Time", c: "st-ok" },
  { n: "2151", r: "Acela",       t: "6:05 AM", s: "On Time", c: "st-ok", hl: true },
  { n: "85",   r: "NE Regional", t: "7:00 AM", s: "On Time", c: "st-ok" },
  { n: "95",   r: "Vermonter",   t: "7:15 AM", s: "On Time", c: "st-ok" },
  { n: "2153", r: "Acela",       t: "8:00 AM", s: "On Time", c: "st-ok" },
];

// After delay: train 85 gets delayed to 7:25 AM, train 95 (7:15) moves above it
const DELAYED: Train[] = [
  { n: "171",  r: "NE Regional", t: "6:10 AM", s: "On Time",  c: "st-ok" },
  { n: "2151", r: "Acela",       t: "6:05 AM", s: "On Time",  c: "st-ok", hl: true },
  { n: "95",   r: "Vermonter",   t: "7:15 AM", s: "On Time",  c: "st-ok" },
  { n: "85",   r: "NE Regional", t: "7:25 AM", s: "+25 min",  c: "st-late" },
  { n: "2153", r: "Acela",       t: "8:00 AM", s: "On Time",  c: "st-ok" },
];

export function DepartureBoard() {
  const [phase, setPhase] = useState<"initial" | "flash" | "delayed">("initial");

  useEffect(() => {
    const cycle = () => {
      setPhase("initial");
      const t1 = setTimeout(() => setPhase("flash"), 3000);
      const t2 = setTimeout(() => setPhase("delayed"), 3400);
      const t3 = setTimeout(() => cycle(), 8000);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    };
    const cleanup = cycle();
    return cleanup;
  }, []);

  const trains = phase === "initial" ? INITIAL : DELAYED;

  return (
    <div className="reveal app-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" style={{ animation: "pulse-soft 2s infinite" }} />
          <span className="text-[11px] font-mono text-black/45 uppercase tracking-wider">Departures — BOS</span>
        </div>
        <span className="text-[11px] text-black/30 font-mono">Today</span>
      </div>
      <div className="relative">
        {trains.map((t) => (
          <div
            key={t.n}
            className="board-row"
            style={{
              ...( t.hl ? { background: "rgba(0,0,0,0.04)", border: "1px solid #d8d8d8", borderRadius: 8 } : undefined ),
              transition: "transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
              ...(phase === "flash" && (t.n === "85" || t.n === "95") ? { opacity: 0.4 } : {}),
            }}
          >
            <span className="board-cell text-black/75 font-semibold text-center">{t.n}</span>
            <span className="text-[13px] text-black/50 truncate">{t.r}</span>
            <span className={`board-cell text-right ${phase !== "initial" && t.n === "85" ? "text-black/40" : "text-black/55"}`}>
              {phase !== "initial" && t.n === "85" ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="line-through decoration-black/30 text-black/30">7:00</span>
                  <span>7:25 AM</span>
                </span>
              ) : t.t}
            </span>
            <span className={`text-[12px] font-medium text-right transition-colors duration-300 ${t.c}`}>{t.s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
