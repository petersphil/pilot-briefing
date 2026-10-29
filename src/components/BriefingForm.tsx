"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  REGIONS,
  airportsForSelection,
  parseAirportList,
  selectionLabel,
  type RegionKey,
} from "@/lib/regions";

export interface BriefingFormValues {
  airports: string[];
  label: string;
  departureUtc: string;
  enrouteMinutes: number;
}

/** Departure offsets from now: +30 min … +6 h. */
const DEP_OFFSETS = Array.from({ length: 12 }, (_, i) => (i + 1) * 30);
/** Flight durations: 30 min … 8 h. */
const DURATIONS = Array.from({ length: 16 }, (_, i) => (i + 1) * 30);

const SETTINGS_KEY = "pilot-briefing.form.v2";

function hm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function ddhhmm(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function departureFromOffset(offsetMin: number, now = new Date()): Date {
  const d = new Date(now.getTime() + offsetMin * 60_000);
  d.setUTCSeconds(0, 0);
  return d;
}

interface Saved {
  regions: RegionKey[];
  custom: string;
  depOffset: number;
  duration: number;
}

function loadSaved(): Saved | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

export function BriefingForm({
  onSubmit,
  loading,
  onScheduleChange,
}: {
  onSubmit: (v: BriefingFormValues) => void;
  loading: boolean;
  onScheduleChange?: (departureUtc: string, enrouteMinutes: number) => void;
}) {
  const [regions, setRegions] = useState<RegionKey[]>(["west"]);
  const [custom, setCustom] = useState("");
  const [depOffset, setDepOffset] = useState(30);
  const [duration, setDuration] = useState(120);
  const [now, setNow] = useState(() => new Date());

  // Restore last selection on this device
  useEffect(() => {
    const s = loadSaved();
    if (!s) return;
    if (Array.isArray(s.regions)) setRegions(s.regions);
    if (typeof s.custom === "string") setCustom(s.custom);
    if (DEP_OFFSETS.includes(s.depOffset)) setDepOffset(s.depOffset);
    if (DURATIONS.includes(s.duration)) setDuration(s.duration);
  }, []);

  // Keep option times fresh
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    onScheduleChange?.(departureFromOffset(depOffset, now).toISOString(), duration);
  }, [depOffset, duration, now, onScheduleChange]);

  const customList = useMemo(() => parseAirportList(custom), [custom]);
  const airports = useMemo(() => airportsForSelection(regions, customList), [regions, customList]);
  const label = selectionLabel(regions, customList);

  function toggleRegion(k: RegionKey) {
    setRegions((cur) => (cur.includes(k) ? cur.filter((r) => r !== k) : [...cur, k]));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!airports.length) return;
    try {
      window.localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ regions, custom, depOffset, duration } satisfies Saved)
      );
    } catch {
      /* ignore */
    }
    onSubmit({
      airports,
      label,
      departureUtc: departureFromOffset(depOffset).toISOString(),
      enrouteMinutes: duration,
    });
  }

  const caption = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-cyan-400/90";
  const field =
    "w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <span className={caption}>Region</span>
        <div className="grid grid-cols-2 gap-3">
          {REGIONS.map((r) => {
            const on = regions.includes(r.key);
            return (
              <button
                key={r.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleRegion(r.key)}
                className={`rounded-xl px-3 py-4 text-base font-bold ring-1 transition ${
                  on
                    ? "bg-cyan-500 text-slate-950 ring-cyan-300"
                    : "bg-slate-800 text-slate-200 ring-slate-700"
                }`}
              >
                {r.short}
                <span
                  className={`mt-0.5 block text-[10px] font-medium ${
                    on ? "text-slate-900/80" : "text-slate-400"
                  }`}
                >
                  {r.airports.length} airports
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="block">
        <span className={caption}>Airports</span>
        <input
          className={field}
          value={custom}
          onChange={(e) => setCustom(e.target.value.toUpperCase())}
          placeholder="Add airports, e.g. CYOJ, CYSM, CYZF"
          autoCapitalize="characters"
          inputMode="text"
        />
        <span className="mt-1 block text-[11px] text-slate-500">
          Added to any region you picked. Turn both regions off to brief only these.
        </span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={caption}>Departure</span>
          <select
            className={field}
            value={depOffset}
            onChange={(e) => setDepOffset(Number(e.target.value))}
          >
            {DEP_OFFSETS.map((m) => (
              <option key={m} value={m}>
                {ddhhmm(departureFromOffset(m, now)).slice(3)}z (+{hm(m)})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={caption}>Flight time</span>
          <select
            className={field}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {hm(m)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading || !airports.length}
        className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 px-4 py-4 text-sm font-bold uppercase tracking-wide text-slate-950 shadow-lg shadow-cyan-500/20 disabled:opacity-60"
      >
        {loading ? "Building briefing…" : airports.length ? `Brief ${airports.length} airports` : "Pick a region or airports"}
      </button>
    </form>
  );
}
