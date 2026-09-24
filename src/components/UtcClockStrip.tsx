"use client";

import { useEffect, useState } from "react";

/** Current UTC: YYYY-MM-DD-HH:MMz */
export function formatNowUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}-${h}:${mi}z`;
}

/** Arrival UTC: MM-DD-HH:MMz */
export function formatArrivalUtc(d: Date): string {
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mo}-${day}-${h}:${mi}z`;
}

export function arrivalFromSchedule(
  departureUtc: string | null | undefined,
  enrouteMinutes: number | null | undefined
): Date | null {
  if (!departureUtc) return null;
  const dep = new Date(departureUtc);
  if (!Number.isFinite(dep.getTime())) return null;
  const mins = Math.max(0, enrouteMinutes ?? 0);
  return new Date(dep.getTime() + mins * 60 * 1000);
}

/**
 * Always-on sticky strip: current UTC + planned arrival UTC.
 * Light grey on semi-transparent near-black.
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

  const arrival = arrivalFromSchedule(departureUtc, enrouteMinutes);

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 border-b border-black/40 px-3 py-1.5"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.82)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        paddingTop: "max(0.35rem, env(safe-area-inset-top))",
      }}
      aria-live="polite"
    >
      <div className="mx-auto max-w-lg font-mono text-[12px] leading-snug tracking-wide text-slate-300">
        <div>{formatNowUtc(now)}</div>
        <div>{arrival ? formatArrivalUtc(arrival) : "—"}</div>
      </div>
    </div>
  );
}
