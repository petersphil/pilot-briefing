"use client";

import { useCallback, useState } from "react";
import { BriefingForm, type BriefingFormValues } from "./BriefingForm";
import { BriefingResults } from "./BriefingResults";
import { SettingsPanel } from "./SettingsPanel";
import { UtcClockStrip } from "./UtcClockStrip";
import { buildBriefing } from "@/lib/briefing";
import { shouldUseClientBriefing } from "@/lib/http";
import { getRapidApiKey } from "@/lib/settings";
import type { BriefingResponse } from "@/lib/types";

export function BriefingApp() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BriefingResponse | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [departureUtc, setDepartureUtc] = useState<string | null>(null);
  const [enrouteMinutes, setEnrouteMinutes] = useState<number | null>(null);
  const clientMode = shouldUseClientBriefing();

  const onScheduleChange = useCallback((dep: string, enroute: number) => {
    setDepartureUtc(dep);
    setEnrouteMinutes(enroute);
  }, []);

  async function run(values: BriefingFormValues) {
    setLoading(true);
    setError(null);
    setDepartureUtc(values.departureUtc);
    setEnrouteMinutes(values.enrouteMinutes);
    try {
      if (clientMode) {
        const rapidApiKey = await getRapidApiKey();
        const result = await buildBriefing(values, { rapidApiKey });
        setData(result);
      } else {
        const res = await fetch("/api/briefing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setData(json as BriefingResponse);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <UtcClockStrip departureUtc={departureUtc} enrouteMinutes={enrouteMinutes} />
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-10 pt-14">
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
          <BriefingForm onSubmit={run} loading={loading} onScheduleChange={onScheduleChange} />
        </section>

        {error && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {data && <BriefingResults data={data} />}

        {!data && !loading && (
          <p className="mt-2 text-center text-xs text-slate-600">
            {clientMode
              ? "Enter ICAO or IATA codes. Weather & NOTAMs load on-device (native HTTP)."
              : "Enter ICAO or IATA codes. METARs, TAFs & NOTAMs load via server proxy (no CORS)."}
          </p>
        )}

        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </>
  );
}
