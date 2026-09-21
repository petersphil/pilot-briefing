"use client";

import { useMemo, useState } from "react";
import { CategoryBadge, CategoryLegend } from "./CategoryBadge";
import { TafRawDisplay } from "./TafRawDisplay";
import { Tabs, type TabKey } from "./Tabs";
import { NOTAM_GROUP_LABELS, NOTAM_GROUP_ORDER } from "@/lib/notams-client";
import type {
  AirportBriefing,
  BriefingResponse,
  FlightCategory,
  TafHorizonKey,
} from "@/lib/types";

function roleLabel(role: string) {
  if (role === "departure") return "DEP";
  if (role === "destination") return "DEST";
  return "ALT";
}

function roleClass(role: string) {
  if (role === "departure") return "bg-emerald-700/80 text-emerald-100";
  if (role === "destination") return "bg-sky-700/80 text-sky-100";
  return "bg-amber-700/80 text-amber-100";
}

function cardBorder(cat: FlightCategory | string) {
  const c = String(cat).toUpperCase();
  if (c === "VFR") return "#008000";
  if (c === "MVFR") return "#FFFF00";
  if (c === "IFR") return "#FF0000";
  if (c === "LIFR") return "#FF00FF";
  return "#475569";
}

function formatUtc(iso: string) {
  try {
    const d = new Date(iso);
    return d.toISOString().replace(".000Z", "Z").replace("T", " ");
  } catch {
    return iso;
  }
}

function AirportHeader({ b }: { b: AirportBriefing }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${roleClass(b.airport.role)}`}>
            {roleLabel(b.airport.role)}
          </span>
          <span className="font-mono text-lg font-bold text-white">{b.airport.icao}</span>
          {b.airport.iata && (
            <span className="font-mono text-xs text-slate-400">{b.airport.iata}</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-400 line-clamp-2">
          {b.airport.name}
          {b.airport.city ? ` · ${b.airport.city}` : ""}
          {` · ${b.airport.country}`}
        </p>
      </div>
      <CategoryBadge category={b.flightCategory} />
    </div>
  );
}

function MetarCards({ airports }: { airports: AirportBriefing[] }) {
  return (
    <div className="space-y-3">
      {airports.map((b) => (
        <article
          key={b.airport.icao}
          className="rounded-xl bg-slate-900/90 p-3 ring-1 ring-slate-800"
          style={{ borderLeft: `4px solid ${cardBorder(b.flightCategory)}` }}
        >
          <AirportHeader b={b} />
          {b.metar ? (
            <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-slate-200">
              {b.metar.rawOb}
            </pre>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No METAR available</p>
          )}
          {b.metar?.reportTime && (
            <p className="mt-2 text-[10px] text-slate-500">
              Report {formatUtc(b.metar.reportTime)} · sorted W→E
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

function TafCards({
  airports,
  horizon,
  horizonAt,
  departureUtc,
  enrouteMinutes,
}: {
  airports: AirportBriefing[];
  horizon: TafHorizonKey;
  horizonAt?: string;
  departureUtc: string;
  enrouteMinutes: number;
}) {
  return (
    <div className="space-y-3">
      {horizonAt && (
        <p className="text-xs text-slate-400">
          Snapshot at <span className="font-mono text-cyan-300">{formatUtc(horizonAt)}</span> (UTC)
        </p>
      )}
      {airports.map((b) => {
        const snap = b.tafSnapshots[horizon];
        const cat = snap?.flightCategory || "UNK";
        return (
          <article
            key={b.airport.icao}
            className="rounded-xl bg-slate-900/90 p-3 ring-1 ring-slate-800"
            style={{ borderLeft: `4px solid ${cardBorder(cat)}` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${roleClass(b.airport.role)}`}>
                    {roleLabel(b.airport.role)}
                  </span>
                  <span className="font-mono text-lg font-bold text-white">{b.airport.icao}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400 line-clamp-1">{b.airport.name}</p>
              </div>
              <CategoryBadge category={cat} />
            </div>
            {snap ? (
              <>
                <p className="mt-3 text-sm font-medium text-slate-100">{snap.summary}</p>
                {b.taf?.rawTAF ? (
                  <TafRawDisplay
                    taf={b.taf}
                    departureUtc={departureUtc}
                    enrouteMinutes={enrouteMinutes}
                  />
                ) : null}
              </>
            ) : b.taf?.rawTAF ? (
              <>
                <p className="mt-3 text-xs text-amber-200/90">
                  Structured TAF horizons unavailable — raw TAF:
                </p>
                <TafRawDisplay
                  taf={b.taf}
                  departureUtc={departureUtc}
                  enrouteMinutes={enrouteMinutes}
                />
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No TAF for this horizon</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function NotamCards({ airports }: { airports: AirportBriefing[] }) {
  return (
    <div className="space-y-4">
      {airports.map((b) => (
        <article key={b.airport.icao} className="rounded-xl bg-slate-900/90 p-3 ring-1 ring-slate-800">
          <AirportHeader b={b} />
          <div className="mt-3 space-y-3">
            {NOTAM_GROUP_ORDER.map((g) => {
              const list = b.notamsByGroup[g] || [];
              if (!list.length) return null;
              return (
                <div key={g}>
                  <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-400/90">
                    {NOTAM_GROUP_LABELS[g]}
                  </h4>
                  <ul className="space-y-2">
                    {list.map((n) => (
                      <li
                        key={n.id}
                        className="rounded-lg bg-slate-950/80 px-2.5 py-2 font-mono text-[11px] leading-snug text-slate-300 ring-1 ring-slate-800"
                      >
                        {n.text}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {!NOTAM_GROUP_ORDER.some((g) => (b.notamsByGroup[g] || []).length) && (
              <p className="text-sm text-slate-500">
                No grouped NOTAMs (runway / taxiway / fuel / IFR approach / lighting). Crane, birds, and
                wildlife are excluded.
              </p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

export function BriefingResults({ data }: { data: BriefingResponse }) {
  const [tab, setTab] = useState<TabKey>("metars");

  const horizonAt = useMemo(() => {
    const h = data.horizons.find((x) => x.key === tab);
    return h?.atUtc;
  }, [data.horizons, tab]);

  const tafProps = {
    departureUtc: data.departureUtc,
    enrouteMinutes: data.enrouteMinutes,
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-900/60 p-3 ring-1 ring-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs text-slate-400">Airports W→E</p>
            <p className="font-mono text-sm text-cyan-300">
              {data.sortedWestToEast.join(" → ") || "—"}
            </p>
          </div>
          <div className="text-right text-[11px] text-slate-500">
            <div>Dep {formatUtc(data.departureUtc)}</div>
            <div>Enroute {data.enrouteMinutes} min</div>
          </div>
        </div>
        <div className="mt-3">
          <CategoryLegend />
        </div>
      </div>

      {data.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          {data.warnings.map((w, i) => (
            <p key={i}>⚠ {w}</p>
          ))}
        </div>
      )}

      <Tabs active={tab} onChange={setTab} />

      <div role="tabpanel">
        {tab === "metars" && <MetarCards airports={data.airports} />}
        {tab === "dep" && (
          <TafCards airports={data.airports} horizon="dep" horizonAt={horizonAt} {...tafProps} />
        )}
        {tab === "plus6" && (
          <TafCards airports={data.airports} horizon="plus6" horizonAt={horizonAt} {...tafProps} />
        )}
        {tab === "plus12" && (
          <TafCards airports={data.airports} horizon="plus12" horizonAt={horizonAt} {...tafProps} />
        )}
        {tab === "plus18" && (
          <TafCards airports={data.airports} horizon="plus18" horizonAt={horizonAt} {...tafProps} />
        )}
        {tab === "plus24" && (
          <TafCards airports={data.airports} horizon="plus24" horizonAt={horizonAt} {...tafProps} />
        )}
        {tab === "notams" && <NotamCards airports={data.airports} />}
      </div>

      <p className="text-[10px] leading-relaxed text-slate-600">{data.coverageNote}</p>
      <p className="text-[10px] text-slate-600">
        NOTAM source: {data.notamSource} · Generated {formatUtc(data.generatedAt)}
      </p>
    </div>
  );
}
