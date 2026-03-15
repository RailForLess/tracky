"use client";

import { useEffect, useState } from "react";

export function Countdown({ hours = 1, minutes = 58, seconds = 32 }: { hours?: number; minutes?: number; seconds?: number }) {
  const [total, setTotal] = useState(hours * 3600 + minutes * 60 + seconds);

  useEffect(() => {
    const iv = setInterval(() => {
      setTotal((t) => (t <= 0 ? hours * 3600 + minutes * 60 + seconds : t - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, [hours, minutes, seconds]);

  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return (
    <span>{h}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}</span>
  );
}
