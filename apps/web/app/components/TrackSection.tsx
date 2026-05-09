"use client";

import { RefObject } from "react";
import { PairRow } from "./TrackRow";
import { Notif } from "./Notif";
import { Countdown } from "./Countdown";
import { LiveMap } from "./LiveMap";
import { DepartureBoard } from "./DepartureBoard";

function WIcon({ kind, size = 20 }: { kind: "sun" | "psun" | "cloud"; size?: number }) {
  const orange = "#FF6B35";
  if (kind === "sun") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3.6" fill={orange} opacity="0.9" />
        <g stroke={orange} strokeWidth="1.6" strokeLinecap="round" opacity="0.7">
          <line x1="12" y1="3" x2="12" y2="5.5" />
          <line x1="12" y1="18.5" x2="12" y2="21" />
          <line x1="3" y1="12" x2="5.5" y2="12" />
          <line x1="18.5" y1="12" x2="21" y2="12" />
          <line x1="5.6" y1="5.6" x2="7.4" y2="7.4" />
          <line x1="16.6" y1="16.6" x2="18.4" y2="18.4" />
          <line x1="5.6" y1="18.4" x2="7.4" y2="16.6" />
          <line x1="16.6" y1="7.4" x2="18.4" y2="5.6" />
        </g>
      </svg>
    );
  }
  if (kind === "psun") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="8.5" cy="8" r="3" fill={orange} opacity="0.9" />
        <g stroke={orange} strokeWidth="1.4" strokeLinecap="round" opacity="0.65">
          <line x1="8.5" y1="1.8" x2="8.5" y2="3.4" />
          <line x1="2" y1="8" x2="3.6" y2="8" />
          <line x1="3.7" y1="3.2" x2="4.9" y2="4.4" />
          <line x1="13.3" y1="3.2" x2="12.1" y2="4.4" />
        </g>
        <path d="M17.6 21c1.88 0 3.4-1.52 3.4-3.4 0-1.78-1.37-3.24-3.13-3.39-.46-2.13-2.34-3.73-4.6-3.73-2.6 0-4.7 2.1-4.7 4.7 0 .22.02.44.05.66C7.2 16.05 6.2 17.2 6.2 18.6 6.2 19.93 7.27 21 8.6 21h9z" fill="#374151" opacity="0.55" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M17.6 19.5c1.88 0 3.4-1.52 3.4-3.4 0-1.78-1.37-3.24-3.13-3.39-.46-2.13-2.34-3.73-4.6-3.73-2.6 0-4.7 2.1-4.7 4.7 0 .22.02.44.05.66C7.2 14.55 6.2 15.7 6.2 17.1c0 1.33 1.07 2.4 2.4 2.4h9z" fill="#6B7280" opacity="0.6" />
    </svg>
  );
}

export function TrackSection({ trackRef }: { trackRef: RefObject<HTMLElement | null> }) {
  return (
    <section ref={trackRef} className="relative pt-16 pb-0">
      <div className="track-spine hidden md:block"><div className="track-ties" /></div>
      <div className="track-spine-mobile md:hidden"><div className="track-ties" /></div>

      {/* ---- SEARCH & SAVE ---- */}
      <div id="preflight" />
      <PairRow
        left={
          <div className="max-w-sm w-full space-y-3">
            <Notif title="Acela 2151 — Saved" body="BOS → WAS · Departs 6:05 AM tomorrow" time="9:12 PM" />
            <Notif title="Calendar sync found 1 trip" body="Imported Acela 2151 on Mar 15 from your calendar" time="9:12 PM" />
          </div>
        }
        right={
          <div className="max-w-sm w-full">
            <p className="reveal text-xs font-mono text-black/25 uppercase tracking-[0.2em] mb-3">Preflight</p>
            <h3 className="reveal text-2xl md:text-3xl font-bold mb-3">Find your train in seconds</h3>
            <p className="reveal reveal-d1 text-black/45 leading-relaxed">
              Search by train number, route name, or station. Two-station trip search
              finds every option on any date. Save with one tap&nbsp;&mdash; Tracky
              remembers across sessions.
            </p>
          </div>
        }
      />

      {/* ---- COUNTDOWN ---- */}
      <PairRow
        left={
          <div className="max-w-sm w-full">
            <p className="reveal text-xs font-mono text-black/25 uppercase tracking-[0.2em] mb-3">Departure day</p>
            <h3 className="reveal text-2xl md:text-3xl font-bold mb-3">A countdown to every moment</h3>
            <p className="reveal reveal-d1 text-black/45 leading-relaxed">
              Wake up to a live countdown. Your saved train front and center
              with real-time status. Know the second something changes&nbsp;&mdash;
              before Amtrak posts it.
            </p>
          </div>
        }
        right={
          <div className="max-w-sm w-full">
            <div className="reveal app-card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-lg font-bold text-black">Acela 2151</p>
                  <p className="text-black/45 text-xs">Boston → Washington</p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-[#10B981]/12 st-ok font-medium">On Time</span>
              </div>
              <div className="flex items-center justify-between mb-5">
                <div className="text-center">
                  <p className="text-2xl font-bold text-black">BOS</p>
                  <p className="text-black/45 text-xs mt-0.5">6:05 AM</p>
                </div>
                <div className="flex-1 mx-5 flex items-center">
                  <div className="h-px flex-1 bg-black/10" />
                  <span className="px-2 text-black/30 text-xs">6h 45m</span>
                  <div className="h-px flex-1 bg-black/10" />
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-black">WAS</p>
                  <p className="text-black/45 text-xs mt-0.5">12:50 PM</p>
                </div>
              </div>
              <div className="text-center pt-2">
                <p className="text-black/40 text-[10px] uppercase tracking-widest mb-1">Departs in</p>
                <p className="text-4xl font-mono font-bold tracking-wide text-black"><Countdown /></p>
              </div>
            </div>
          </div>
        }
      />

      {/* ---- DEPARTURE BOARD ---- */}
      <div id="departure-board" />
      <PairRow
        left={
          <div className="max-w-md w-full">
            <DepartureBoard />
          </div>
        }
        right={
          <div className="max-w-sm w-full">
            <p className="reveal text-xs font-mono text-black/25 uppercase tracking-[0.2em] mb-3">At the station</p>
            <h3 className="reveal text-2xl md:text-3xl font-bold mb-3">Every station. Every train. Live.</h3>
            <p className="reveal reveal-d1 text-black/45 leading-relaxed">
              Pull up the departure board for any of 500+ Amtrak stations.
              Filter arrivals and departures, browse future dates, and
              swipe any train to save&nbsp;&mdash; right from the board.
            </p>
          </div>
        }
      />

      {/* ---- LIVE MAP ---- */}
      <div id="live-map" />
      <PairRow
        left={
          <div className="max-w-sm w-full">
            <p className="reveal text-xs font-mono text-black/25 uppercase tracking-[0.2em] mb-3">All aboard</p>
            <h3 className="reveal text-2xl md:text-3xl font-bold mb-3">Watch your train. In real time.</h3>
            <p className="reveal reveal-d1 text-black/45 leading-relaxed">
              A full-screen map with every active Amtrak train in the country.
              Positions update every 15 seconds from live GTFS-RT data.
              Color-coded routes and smart station clustering.
            </p>
          </div>
        }
        right={
          <div className="max-w-md w-full">
            <div className="reveal map-frame aspect-[4/3]">
              <LiveMap />
            </div>
          </div>
        }
      />

      {/* ---- EN ROUTE ---- */}
      <div id="en-route" />
      <PairRow
        left={
          <div className="max-w-sm w-full">
            {/* Speed / bearing pills above the card */}
            <div className="reveal flex gap-2 mb-2 justify-center">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#fafafa] border border-[#e5e5e5] text-[11px] font-mono text-black/60">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                124 mph
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#fafafa] border border-[#e5e5e5] text-[11px] font-mono text-black/60">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 2v10l6 3.5"/></svg>
                SW
              </span>
            </div>
            <div className="reveal app-card">
              <div className="grid gap-0" style={{ gridTemplateColumns: "auto 1fr auto auto auto" }}>
              {[
                { stop: "Boston South",  sched: "6:05 AM",  actual: null,      delay: null,     s: "departed" },
                { stop: "Providence",    sched: "6:40 AM",  actual: "6:42 AM", delay: "+2m",    s: "departed" },
                { stop: "New Haven",     sched: "7:55 AM",  actual: "8:07 AM", delay: "+12m",   s: "current" },
                { stop: "New York Penn", sched: "9:10 AM",  actual: "9:22 AM", delay: "+12m",   s: "upcoming" },
                { stop: "Philadelphia",  sched: "10:25 AM", actual: "10:37 AM",delay: "+12m",   s: "upcoming" },
                { stop: "Washington",    sched: "12:50 PM", actual: "1:02 PM", delay: "+12m",   s: "upcoming" },
              ].map((r, i, arr) => (
                <div key={i} className="contents">
                  {/* Dot + line */}
                  <div className="flex flex-col items-center w-3 pt-2 pr-2">
                    <div className={`w-2.5 h-2.5 rounded-full border-[1.5px] ${
                      r.s === "departed" ? "bg-black/20 border-black/20" :
                      r.s === "current"  ? "bg-black border-black" :
                      "bg-transparent border-black/15"
                    }`} style={r.s === "current" ? { boxShadow: "0 0 8px rgba(0,0,0,0.25)" } : undefined} />
                    {i < arr.length - 1 && <div className={`w-px flex-1 mt-0.5 ${r.s === "departed" ? "bg-black/15" : "bg-black/8"}`} />}
                  </div>
                  {/* Station name — left aligned */}
                  <span className={`text-[13px] py-1.5 ${
                    r.s === "current"  ? "text-black font-medium" :
                    r.s === "departed" ? "text-black/30" : "text-black/55"
                  }`}>{r.stop}</span>
                  {/* Scheduled time — center */}
                  <span className={`text-[12px] font-mono py-1.5 text-center px-2 ${r.delay ? "text-black/25 line-through decoration-black/30" : r.s === "current" ? "text-black" : "text-black/30"}`}>{r.sched}</span>
                  {/* Actual time */}
                  <span className={`text-[12px] font-mono py-1.5 text-center min-w-[60px] ${r.s === "current" ? "text-black" : "text-black/55"}`}>{r.actual || ""}</span>
                  {/* Delay badge — right aligned */}
                  <span className="py-1.5 text-right min-w-[40px]">
                    {r.delay && <span className="text-[10px] font-mono font-semibold st-late px-1.5 py-0.5 rounded-full bg-red-500/10">{r.delay}</span>}
                  </span>
                </div>
              ))}
              </div>
            </div>
          </div>
        }
        right={
          <div className="max-w-sm w-full">
            <p className="reveal text-xs font-mono text-black/25 uppercase tracking-[0.2em] mb-3">En route</p>
            <h3 className="reveal text-2xl md:text-3xl font-bold mb-3">Every stop. Every delay. Every mile.</h3>
            <p className="reveal reveal-d1 text-black/45 leading-relaxed">
              Full itinerary updating in real time. Speed, bearing,
              per-stop delay&nbsp;&mdash; early, on time, or late by exactly how many
              minutes. Tap any station to open its departure board.
            </p>
          </div>
        }
      />

      {/* ---- DELAYS ---- */}
      <PairRow
        left={
          <div className="max-w-sm w-full">
            <p className="reveal text-xs font-mono text-black/25 uppercase tracking-[0.2em] mb-3">Delays</p>
            <h3 className="reveal text-2xl md:text-3xl font-bold mb-3">Conductor-level intelligence</h3>
            <p className="reveal reveal-d1 text-black/45 leading-relaxed">
              Live GTFS-RT delay data for every stop along the route. The moment
              a delay is reported, you see it&nbsp;&mdash; often minutes before the
              official app catches up.
            </p>
          </div>
        }
        right={
          <div className="max-w-sm w-full space-y-3">
            <Notif title="Acela 2151 — Delayed 12m" body="Late equipment from previous service. New departure: 6:17 AM." time="5:48 AM" />
            <Notif title="Acela 2151 — Back on schedule" body="Made up time after Providence. ETA 12:50 PM at WAS." time="7:22 AM" />
          </div>
        }
      />

      {/* ---- WEATHER ---- */}
      <PairRow
        left={
          <div className="max-w-sm w-full">
            <div className="reveal app-card">
              {/* Header row */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-1.5">
                  <svg width="11" height="13" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s7-7.2 7-13a7 7 0 1 0-14 0c0 5.8 7 13 7 13z"/>
                    <circle cx="12" cy="9" r="2.5" fill="#FF6B35"/>
                  </svg>
                  <p className="text-black/45 text-[10px] uppercase tracking-[0.18em] font-mono">Washington, DC</p>
                </div>
                <p className="text-black/35 text-[10px] uppercase tracking-[0.18em] font-mono">Partly cloudy</p>
              </div>

              {/* Big temp + condition icon */}
              <div className="flex items-end justify-between mb-1">
                <div className="flex items-start leading-none">
                  <span className="text-[64px] font-light text-black tabular-nums tracking-tight">72</span>
                  <span className="text-2xl font-light text-black/45 mt-2">°</span>
                </div>
                <WIcon kind="psun" size={56} />
              </div>
              <div className="flex items-center gap-3 mb-5 text-[11px] font-mono text-black/45">
                <span>H 76°</span>
                <span className="text-black/20">·</span>
                <span>L 64°</span>
                <span className="text-black/20">·</span>
                <span>Feels 70°</span>
              </div>

              {/* Hourly forecast */}
              <div className="app-card-inner">
                <div className="grid grid-cols-5">
                  {[
                    { t: "Now",  k: "sun"   as const, temp: "72°" },
                    { t: "1 PM", k: "psun"  as const, temp: "74°" },
                    { t: "2 PM", k: "psun"  as const, temp: "73°" },
                    { t: "3 PM", k: "cloud" as const, temp: "70°" },
                    { t: "4 PM", k: "cloud" as const, temp: "67°" },
                  ].map((h, i) => (
                    <div key={h.t} className={`flex flex-col items-center gap-1.5 py-1 ${i === 0 ? "text-black" : "text-black/70"}`}>
                      <p className="text-[10px] font-mono text-black/45">{h.t}</p>
                      <WIcon kind={h.k} size={20} />
                      <p className="text-[12px] font-mono">{h.temp}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        }
        right={
          <div className="max-w-sm w-full">
            <p className="reveal text-xs font-mono text-black/25 uppercase tracking-[0.2em] mb-3">Almost there</p>
            <h3 className="reveal text-2xl md:text-3xl font-bold mb-3">What&apos;s waiting for you</h3>
            <p className="reveal reveal-d1 text-black/45 leading-relaxed">
              As you approach your destination, check the weather forecast&nbsp;&mdash;
              temperature, conditions, hourly breakdown. Fahrenheit or Celsius.
            </p>
          </div>
        }
      />

      {/* ---- ARRIVED ---- */}
      <div id="arrived" />
      <PairRow
        left={
          <div className="max-w-sm w-full">
            <p className="reveal text-xs font-mono text-black/25 uppercase tracking-[0.2em] mb-3">Arrived</p>
            <h3 className="reveal text-2xl md:text-3xl font-bold mb-3">A hall of fame for your&nbsp;travels</h3>
            <p className="reveal reveal-d1 text-black/45 leading-relaxed">
              Every completed trip is automatically archived. Browse your
              history, see lifetime stats, and share beautiful ticket art.
            </p>
          </div>
        }
        right={
          <div className="max-w-md w-full">
            <div className="reveal rounded-2xl p-6 text-white" style={{ backgroundColor: "#3949AB", boxShadow: "0 4px 20px rgba(57,73,171,0.3)" }}>
              {/* Header */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C8 2 5 3 5 7v8c0 2.2 1.8 4 4 4l-1.5 1.5V21h2l2-2h1l2 2h2v-.5L15 19c2.2 0 4-1.8 4-4V7c0-4-3-5-7-5zM9 17c-.83 0-1.5-.67-1.5-1.5S8.17 14 9 14s1.5.67 1.5 1.5S9.83 17 9 17zm6 0c-.83 0-1.5-.67-1.5-1.5S14.17 14 15 14s1.5.67 1.5 1.5S15.83 17 15 17zm2-6H7V7h10v4z"/></svg>
                  <span className="text-[15px] font-bold tracking-wide">ALL-TIME SUPERTICKET</span>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              </div>
              <p className="text-[11px] text-white/70 tracking-wide mb-5">🎫 SUPERTICKET · RAIL · EXPRESS</p>

              {/* Top stats — 2 col */}
              <div className="grid grid-cols-2 gap-5 mb-4">
                <div>
                  <p className="text-[11px] text-white/70 font-semibold tracking-wide mb-1">TRIPS</p>
                  <p className="text-2xl font-bold">47</p>
                </div>
                <div>
                  <p className="text-[11px] text-white/70 font-semibold tracking-wide mb-1">DISTANCE</p>
                  <p className="text-2xl font-bold">12,849 mi</p>
                  <p className="text-[13px] text-white mt-0.5">0.5x around the world</p>
                </div>
              </div>

              {/* Bottom stats — 3 col */}
              <div className="grid grid-cols-3 gap-5 mb-5">
                <div>
                  <p className="text-[11px] text-white/70 font-semibold tracking-wide mb-1">TRAVEL TIME</p>
                  <p className="text-base font-bold">186 hr</p>
                </div>
                <div>
                  <p className="text-[11px] text-white/70 font-semibold tracking-wide mb-1">STATIONS</p>
                  <p className="text-base font-bold">23</p>
                </div>
                <div>
                  <p className="text-[11px] text-white/70 font-semibold tracking-wide mb-1">ROUTES</p>
                  <p className="text-base font-bold">8</p>
                </div>
              </div>

              {/* All Stats button */}
              <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                <span className="text-sm font-semibold">All Train Stats</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            </div>
          </div>
        }
      />
    </section>
  );
}
