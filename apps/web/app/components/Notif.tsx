"use client";

export function Notif({ title, body, time = "now" }: { title: string; body: string; time?: string }) {
  return (
    <div className="reveal notif w-full max-w-[380px] text-left">
      <div className="flex items-center gap-2 mb-1">
        <img src="/tracky-logo.png" alt="" className="w-5 h-5 rounded-md" />
        <span className="text-[11px] text-black/30 font-medium">Tracky</span>
        <span className="text-[11px] text-black/20 ml-auto">{time}</span>
      </div>
      <p className="text-[13px] text-black/80 font-medium leading-snug">{title}</p>
      <p className="text-[12px] text-black/40 leading-snug mt-0.5">{body}</p>
    </div>
  );
}
