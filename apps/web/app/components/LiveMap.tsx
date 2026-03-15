"use client";

import { useEffect, useRef, useState } from "react";

const ROUTE_PATH = "M380,100 Q350,130 320,160 Q290,185 250,210 Q220,230 180,250";
const DUR = 6000; // ms
const PAUSE = 1500; // ms pause at destination before reset

const STATIONS = [
  { x: 380, y: 100, label: "BOS", labelY: -12, pct: 0 },
  { x: 320, y: 160, label: "NHV", labelY: -12, pct: 0.33 },
  { x: 250, y: 210, label: "NYP", labelY: -12, pct: 0.55 },
  { x: 180, y: 250, label: "WAS", labelY: 18,  pct: 0.80 },
];

export function LiveMap() {
  const pathRef = useRef<SVGPathElement>(null);
  const trainRef = useRef<SVGGElement>(null);
  const glowRef = useRef<SVGCircleElement>(null);
  const trailRef = useRef<SVGPathElement>(null);
  const [visited, setVisited] = useState<boolean[]>([true, false, false, false]);
  const rafRef = useRef<number>(0);
  const startRef = useRef(0);

  useEffect(() => {
    const path = pathRef.current;
    const train = trainRef.current;
    const glow = glowRef.current;
    const trail = trailRef.current;
    if (!path || !train || !glow || !trail) return;

    const totalLen = path.getTotalLength();
    trail.style.strokeDasharray = `${totalLen}`;
    trail.style.strokeDashoffset = `${totalLen}`;

    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = (now - startRef.current) % (DUR + PAUSE);
      const t = Math.min(elapsed / DUR, 1); // 0 → 1 over DUR, then stays at 1 during pause

      // Position train on path
      const dist = t * totalLen;
      const pt = path.getPointAtLength(dist);
      train.setAttribute("transform", `translate(${pt.x},${pt.y})`);
      glow.setAttribute("cx", `${pt.x}`);
      glow.setAttribute("cy", `${pt.y}`);

      // Trail follows train
      trail.style.strokeDashoffset = `${totalLen - dist}`;

      // Update visited stations
      setVisited(STATIONS.map((s) => t >= s.pct));

      // Reset at end of pause
      if (elapsed >= DUR + PAUSE - 16) {
        startRef.current = now;
        setVisited([true, false, false, false]);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <svg viewBox="0 0 480 360" fill="none" className="w-full h-full">
      <rect width="480" height="360" fill="#18181B" />
      {[60,120,180,240,300].map(y => <line key={`h${y}`} x1="0" y1={y} x2="480" y2={y} stroke="#2C2C30" strokeWidth="0.5" />)}
      {[80,160,240,320,400].map(x => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="360" stroke="#2C2C30" strokeWidth="0.5" />)}
      <path d="M420 60 Q400 80 390 120 Q380 160 360 180 Q340 200 300 220 Q260 240 220 260 Q180 270 140 280 Q100 285 60 290 L60 360 L480 360 L480 60 Z" fill="#1D1D1F" />

      {/* Route base line (dim) */}
      <path ref={pathRef} d={ROUTE_PATH} stroke="#FF6B35" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.2" />
      {/* Traveled trail */}
      <path ref={trailRef} d={ROUTE_PATH} stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.8" />

      {/* Station markers */}
      {STATIONS.map((s, i) => (
        <g key={s.label}>
          <circle cx={s.x} cy={s.y} r="5" fill="#18181B"
            stroke={visited[i] ? "#fff" : "#444"} strokeWidth={visited[i] ? 1.5 : 1}
            style={{ transition: "stroke 0.3s ease" }} />
          <circle cx={s.x} cy={s.y} r="2"
            fill={visited[i] ? "#fff" : "#444"}
            style={{ transition: "fill 0.3s ease" }} />
          <text x={s.x} y={s.y + s.labelY} fill="#fff" fontSize={i === 0 || i === 3 ? "9" : "8"}
            textAnchor="middle" opacity={i === 0 || i === 3 ? 0.4 : 0.25}
            fontFamily="var(--font-mono)">{s.label}</text>
        </g>
      ))}

      {/* Train glow */}
      <circle ref={glowRef} r="16" fill="#FF6B35" opacity="0.08">
        <animate attributeName="r" values="12;20;12" dur="2s" repeatCount="indefinite" />
      </circle>

      {/* Train icon */}
      <g ref={trainRef}>
        <circle r="9" fill="#18181B" stroke="#fff" strokeWidth="1.2" />
        <g transform="translate(-5,-5.5) scale(0.44)">
          <path d="M12 2C8 2 5 3 5 7v8c0 2.2 1.8 4 4 4l-1.5 1.5V21h2l2-2h1l2 2h2v-.5L15 19c2.2 0 4-1.8 4-4V7c0-4-3-5-7-5zM9 17c-.83 0-1.5-.67-1.5-1.5S8.17 14 9 14s1.5.67 1.5 1.5S9.83 17 9 17zm6 0c-.83 0-1.5-.67-1.5-1.5S14.17 14 15 14s1.5.67 1.5 1.5S15.83 17 15 17zm2-6H7V7h10v4z" fill="#fff"/>
        </g>
      </g>
    </svg>
  );
}
