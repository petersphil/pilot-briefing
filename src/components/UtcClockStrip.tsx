"use client";

import { useEffect, useState } from "react";

/** dd hh:mm */
export function ddhhmmUtc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function arrivalFromSchedule(
  departureUtc: string | null | undefined,
  enrouteMinutes: number | null | undefined
): Date | null {
  if (!departureUtc) return null;
  const dep = new Date(departureUtc);
  if (!Number.isFinite(dep.getTime())) return null;
  return new Date(dep.getTime() + Math.max(0, enrouteMinutes ?? 0) * 60_000);
}

/**
 * Always-on top strip.
 * Line 1 (centered): current dd hh:mm UTC.
 * Line 2: DEP dd hh:mm | ARR dd hh:mm.
 */
export function UtcClockStrip({
  departureUtc,
  enrouteMinutes,
}: {
  departureUtc?: string | null;
  enrouteMinutes?: number | null;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  const dep = departureUtc ? new Date(departureUtc) : null;
  const depOk = dep && Number.isFinite(dep.getTime());
  const arr = arrivalFromSchedule(departureUtc, enrouteMinutes);

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 border-b border-black/40 px-3 pb-1.5"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.82)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        paddingTop: "max(0.35rem, env(safe-area-inset-top))",
      }}
    >
      <div className="mx-auto max-w-lg font-mono text-[12px] leading-snug tracking-wide text-slate-300">
        <div className="text-center">{ddhhmmUtc(now)} UTC</div>
        <div className="grid grid-cols-2">
          <div>DEP {depOk ? ddhhmmUtc(dep!) : "—"}</div>
          <div className="text-right">ARR {arr ? ddhhmmUtc(arr) : "—"}</div>
        </div>
      </div>
    </div>
  );
}
