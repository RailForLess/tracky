"use client";

import { useEffect, useState } from "react";

export function AnimatedNum({ value, suffix = "", go }: { value: number; suffix?: string; go: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!go) return;
    const dur = 2000;
    const t0 = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      setN(Math.round((1 - Math.pow(1 - p, 3)) * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [go, value]);
  return <span className="font-mono tabular-nums">{n.toLocaleString()}{suffix}</span>;
}
