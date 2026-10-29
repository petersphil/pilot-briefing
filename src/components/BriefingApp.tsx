"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BriefingForm, type BriefingFormValues } from "./BriefingForm";
import { BriefingResults } from "./BriefingResults";
import { SettingsPanel } from "./SettingsPanel";
import { UtcClockStrip } from "./UtcClockStrip";
import { buildBriefing } from "@/lib/briefing";
import { shouldUseClientBriefing } from "@/lib/http";
import { getRapidApiKey } from "@/lib/settings";
import type { BriefingResponse } from "@/lib/types";

const CACHE_KEY = "pilot-briefing.last.v1";

type CachedBriefing = { values: BriefingFormValues; data: BriefingResponse; savedAt: string };

function ageText(fromIso: string, now: number): { text: string; stale: boolean } {
  const mins = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60000));
  const text = mins < 1 ? "just now" : mins < 60 ? `${mins} min old` : `${Math.floor(mins / 60)} h ${mins % 60} min old`;
  return { text, stale: mins >= 30 };
}

export function BriefingApp() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BriefingResponse | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [page, setPage] = useState<"form" | "results">("form");
  const [departureUtc, setDepartureUtc] = useState<string | null>(null);
  const [enrouteMinutes, setEnrouteMinutes] = useState<number | null>(null);
  const clientMode = shouldUseClientBriefing();
  const [lastValues, setLastValues] = useState<BriefingFormValues | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pull, setPull] = useState(0);
  const pullStart = useRef<number | null>(null);

  // Open straight to the last saved briefing (works offline).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const c = JSON.parse(raw) as CachedBriefing;
      if (!c?.data?.airports) return;
      setData(c.data);
      setLastValues(c.values);
      setDepartureUtc(c.data.departureUtc);
      setEnrouteMinutes(c.data.enrouteMinutes);
      setFromCache(true);
      setPage("results");
    } catch {
      /* ignore bad cache */
    }
  }, []);

  // Tick the data-age label.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const onScheduleChange = useCallback((dep: string, enroute: number) => {
    setDepartureUtc(dep);
    setEnrouteMinutes(enroute);
  }, []);

  async function run(values: BriefingFormValues, opts: { refresh?: boolean } = {}) {
    setLoading(true);
    setError(null);
    setDepartureUtc(values.departureUtc);
    setEnrouteMinutes(values.enrouteMinutes);
    try {
      if (clientMode) {
        const rapidApiKey = await getRapidApiKey();
        const result = await buildBriefing(values, { rapidApiKey });
        onResult(values, result);
      } else {
        const res = await fetch("/api/briefing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        onResult(values, json as BriefingResponse);
      }
      if (!opts.refresh) window.scrollTo({ top: 0 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      setError(opts.refresh ? `Refresh failed (${msg}) · showing the saved briefing` : msg);
    } finally {
      setLoading(false);
    }
  }

  function onResult(values: BriefingFormValues, result: BriefingResponse) {
    setData(result);
    setLastValues(values);
    setFromCache(false);
    setNow(Date.now());
    setPage("results");
    try {
      const c: CachedBriefing = { values, data: result, savedAt: new Date().toISOString() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    } catch {
      /* storage full: skip cache */
    }
  }

  function refresh() {
    if (loading || !lastValues) return;
    // Same airports and planned departure, fresh data.
    run(lastValues, { refresh: true });
  }

  const showResults = page === "results" && !!data;
  const age = data ? ageText(data.generatedAt, now) : null;

  return (
    <>
      <UtcClockStrip
        departureUtc={showResults && data ? data.departureUtc : departureUtc}
        enrouteMinutes={showResults && data ? data.enrouteMinutes : enrouteMinutes}
      />
      <div
        className={`mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-16 ${
          showResults ? "pb-28" : "pb-10"
        }`}
        onTouchStart={(e) => {
          pullStart.current = showResults && window.scrollY <= 0 ? e.touches[0].clientY : null;
        }}
        onTouchMove={(e) => {
          if (pullStart.current == null) return;
          setPull(Math.max(0, Math.min(120, e.touches[0].clientY - pullStart.current)));
        }}
        onTouchEnd={() => {
          if (pull > 80) refresh();
          pullStart.current = null;
          setPull(0);
        }}
      >
        {showResults && (pull > 0 || loading) && (
          <div
            className="flex justify-center text-xs font-semibold text-cyan-300"
            style={{ height: loading ? 28 : pull / 2 }}
          >
            {loading ? "Refreshing…" : pull > 80 ? "Release to refresh" : "Pull to refresh"}
          </div>
        )}
        {/* Page 1: briefing setup (kept mounted so selections survive) */}
        <div className={showResults ? "hidden" : ""}>
          <header className="mb-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 ring-1 ring-cyan-500/40">
                  <span className="text-lg" aria-hidden>
                    ✈
                  </span>
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-white">Pilot Briefing</h1>
                  <p className="text-xs text-slate-400">Phil Peters · CA / USA / Caribbean · UTC</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800 hover:text-white"
                aria-label="Open settings"
              >
                Settings
              </button>
            </div>
          </header>

          <section className="mb-6 rounded-2xl bg-slate-900/70 p-4 shadow-xl shadow-black/40 ring-1 ring-slate-800">
            <BriefingForm onSubmit={(v) => run(v)} loading={loading} onScheduleChange={onScheduleChange} />
          </section>

          {error && (
            <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {data && !loading && (
            <button
              type="button"
              onClick={() => setPage("results")}
              className="mb-4 w-full rounded-xl px-4 py-3 text-sm font-semibold text-cyan-300 ring-1 ring-cyan-800/80"
            >
              Back to last briefing{data.label ? ` · ${data.label}` : ""}
            </button>
          )}

          {!data && !loading && (
            <p className="mt-2 text-center text-xs text-slate-600">
              {clientMode
                ? "Weather & NOTAMs load on-device (native HTTP)."
                : "METARs, TAFs & NOTAMs load via server proxy (no CORS)."}
            </p>
          )}
        </div>

        {/* Page 2: briefing */}
        {showResults && data && (
          <>
            <div className="mb-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setPage("form");
                  window.scrollTo({ top: 0 });
                }}
                className="shrink-0 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 px-4 py-2.5 text-sm font-bold text-slate-950"
              >
                New Briefing
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {data.label || data.sortedWestToEast.join(", ")}
                </p>
                <p className="text-[11px] text-slate-500">
                  {data.airports.length} airports · {data.enrouteMinutes} min flight ·{" "}
                  <span className={age?.stale ? "font-semibold text-amber-400" : "text-slate-400"}>
                    data {age?.text}
                    {fromCache ? " (saved)" : ""}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={refresh}
                disabled={loading || !lastValues}
                aria-label="Refresh briefing"
                className="ml-auto shrink-0 rounded-xl px-3 py-2 text-lg text-cyan-300 ring-1 ring-slate-700 disabled:opacity-40"
              >
                <span className={loading ? "inline-block animate-spin" : "inline-block"}>↻</span>
              </button>
            </div>
            {error && (
              <div className="mb-3 rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            )}
            <BriefingResults data={data} />
          </>
        )}

        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </>
  );
}
