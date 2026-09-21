"use client";

import { FormEvent, useState } from "react";

export interface BriefingFormValues {
  departure: string;
  destination: string;
  alternates: string[];
  departureUtc: string;
  enrouteMinutes: number;
}

const DEFAULT_ALTERNATES =
  "CYVR, CYLW, CYXC, CYYC, CYEG, CYXE, CYQR, CYWG, CYQT, CYAM, CYSB, CYQF, CYYZ, CYOW, CYUL, CYHM";

/** Now + 1 hour, rounded to the minute (datetime-local / UTC). */
function defaultDepartureUtc(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setUTCSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

export function BriefingForm({
  onSubmit,
  loading,
}: {
  onSubmit: (v: BriefingFormValues) => void;
  loading: boolean;
}) {
  const [departure, setDeparture] = useState("CYYJ");
  const [destination, setDestination] = useState("CYYT");
  const [alternatesText, setAlternatesText] = useState(DEFAULT_ALTERNATES);
  const [departureLocal, setDepartureLocal] = useState(defaultDepartureUtc);
  const [enrouteHours, setEnrouteHours] = useState(6);
  const [enrouteMins, setEnrouteMins] = useState(0);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const alts = alternatesText
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    // Treat datetime-local value as UTC
    const iso = departureLocal.length === 16 ? `${departureLocal}:00.000Z` : `${departureLocal}Z`;
    onSubmit({
      departure: departure.trim(),
      destination: destination.trim(),
      alternates: alts,
      departureUtc: iso,
      enrouteMinutes: Math.max(0, enrouteHours * 60 + enrouteMins),
    });
  }

  const field =
    "w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-base text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-cyan-400/90">
            Departure
          </span>
          <input
            className={field}
            value={departure}
            onChange={(e) => setDeparture(e.target.value.toUpperCase())}
            placeholder="YYC or CYYC"
            autoCapitalize="characters"
            required
            inputMode="text"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-cyan-400/90">
            Destination
          </span>
          <input
            className={field}
            value={destination}
            onChange={(e) => setDestination(e.target.value.toUpperCase())}
            placeholder="DEN or KDEN"
            autoCapitalize="characters"
            required
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-cyan-400/90">
          IFR Alternate(s)
        </span>
        <input
          className={field}
          value={alternatesText}
          onChange={(e) => setAlternatesText(e.target.value.toUpperCase())}
          placeholder="COS, CYS — comma separated"
        />
        <span className="mt-1 block text-[11px] text-slate-500">
          Direct flights only — dep, dest, alternates. No enroute stops.
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-cyan-400/90">
          Departure datetime (UTC)
        </span>
        <input
          type="datetime-local"
          className={field}
          value={departureLocal}
          onChange={(e) => setDepartureLocal(e.target.value)}
          required
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-cyan-400/90">
            Enroute hours
          </span>
          <input
            type="number"
            min={0}
            max={48}
            className={field}
            value={enrouteHours}
            onChange={(e) => setEnrouteHours(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-cyan-400/90">
            + minutes
          </span>
          <input
            type="number"
            min={0}
            max={59}
            className={field}
            value={enrouteMins}
            onChange={(e) => setEnrouteMins(Number(e.target.value))}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-950 shadow-lg shadow-cyan-500/20 disabled:opacity-60"
      >
        {loading ? "Building briefing…" : "Get flight briefing"}
      </button>
    </form>
  );
}
