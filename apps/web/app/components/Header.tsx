"use client";

import { useEffect, useState } from "react";

export function Header({ introStage, headerCompact }: { introStage: number; headerCompact: boolean }) {
  const [starCount, setStarCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("https://api.github.com/repos/Mootbing/Tracky")
      .then(r => r.json())
      .then(d => { if (typeof d.stargazers_count === "number") setStarCount(d.stargazers_count); })
      .catch(() => {});
  }, []);

  return (
    <header className="fixed top-0 left-1/2 z-50" style={{
      transition: "opacity 0.6s ease, transform 0.6s ease, width 0.5s ease, max-width 0.5s ease, top 0.5s ease, border-radius 0.5s ease, background 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease",
      opacity: introStage >= 5 ? 1 : 0,
      transform: introStage >= 5 ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(-30px)",
      width: headerCompact ? "92%" : "100%",
      maxWidth: headerCompact ? "36rem" : "100%",
      top: headerCompact ? "16px" : "0px",
      borderRadius: headerCompact ? "9999px" : "0px",
      background: headerCompact ? "rgba(255,255,255,0.7)" : "transparent",
      backdropFilter: headerCompact ? "blur(24px)" : "none",
      WebkitBackdropFilter: headerCompact ? "blur(24px)" : "none",
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: headerCompact ? "rgba(0,0,0,0.08)" : "transparent",
      boxShadow: headerCompact ? "0 2px 20px rgba(0,0,0,0.06)" : "none",
    }}>
      <div className="flex items-center justify-between px-5 h-12">
        <div className="flex items-center gap-2">
          <img src="/tracky-logo.png" alt="Tracky" className="w-7 h-7 rounded-lg" />
          <span className="text-sm font-bold tracking-tight overflow-hidden" style={{
            transition: "max-width 0.4s ease, opacity 0.4s ease",
            maxWidth: headerCompact ? "0px" : "80px",
            opacity: headerCompact ? 0 : 1,
            whiteSpace: "nowrap",
          }}>Tracky</span>
        </div>
        <div className="flex items-center gap-1.5">
          <a href="#cta" className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black text-white text-xs font-semibold transition-opacity hover:opacity-80">
            Get The App
          </a>
          <a href="https://discord.gg/PqYt7NJvcp" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-black/10 text-black/30 text-xs font-semibold transition-all hover:bg-black/5" aria-label="Discord">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z"/></svg>
          </a>
          <a href="https://github.com/Mootbing/Tracky" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-black/10 text-black/30 text-xs font-semibold transition-all hover:bg-black/5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
              {starCount !== null && <span>{starCount >= 1000 ? `${(starCount / 1000).toFixed(1)}k` : starCount}</span>}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#F5C518" className="-ml-0.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </a>
        </div>
      </div>
    </header>
  );
}
