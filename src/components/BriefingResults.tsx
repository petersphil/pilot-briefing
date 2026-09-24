"use client";

import { useState } from "react";
import { CategoryBadge } from "./CategoryBadge";
import { TafRawDisplay } from "./TafRawDisplay";
import { MetarRawDisplay } from "./MetarRawDisplay";
import { NotamDisplay } from "./NotamDisplay";
import { AtisSheet } from "./AtisSheet";
import { Tabs, type TabKey } from "./Tabs";
import { NOTAM_GROUP_LABELS, NOTAM_GROUP_ORDER } from "@/lib/notams-client";
import { worstCategoryInFlightWindow } from "@/lib/taf";
import { atisLinkForAirport, type AtisLink } from "@/lib/atis";
import type {
  AirportBriefing,
  BriefingResponse,
  FlightCategory,
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

function AirportHeader({
  b,
  atis,
  onOpenAtis,
}: {
  b: AirportBriefing;
  atis?: AtisLink | null;
  onOpenAtis?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
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
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <CategoryBadge category={b.flightCategory} />
        {atis && onOpenAtis && (
          <button
            type="button"
            onClick={onOpenAtis}
            className="rounded-md bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-300 ring-1 ring-cyan-800/80 active:bg-slate-700"
          >
            {atis.label}
          </button>
        )}
      </div>
    </div>
  );
}

function MetarCards({
  airports,
  onOpenAtis,
}: {
  airports: AirportBriefing[];
  onOpenAtis: (link: AtisLink) => void;
}) {
  return (
    <div className="space-y-3">
      {airports.map((b) => {
        // Only airports that are reporting a METAR get an ATIS button
        const atis = b.metar ? atisLinkForAirport(b.airport) : null;
        return (
          <article
            key={b.airport.icao}
            className="rounded-xl bg-slate-900/90 p-3 ring-1 ring-slate-800"
            style={{ borderLeft: `4px solid ${cardBorder(b.flightCategory)}` }}
          >
            <AirportHeader
              b={b}
              atis={atis}
              onOpenAtis={atis ? () => onOpenAtis(atis) : undefined}
            />
            {b.metar ? (
              <MetarRawDisplay rawOb={b.metar.rawOb} />
            ) : (
              <p className="mt-3 text-sm text-slate-500">No METAR available</p>
            )}
            {b.metar?.reportTime && (
              <p className="mt-2 text-[10px] text-slate-500">
                Report {formatUtc(b.metar.reportTime)} · sorted W→E
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function TafCards({
  airports,
  departureUtc,
  enrouteMinutes,
}: {
  airports: AirportBriefing[];
  departureUtc: string;
  enrouteMinutes: number;
}) {
  const dep = new Date(departureUtc);
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        Badge = worst category in flight window (dep → enroute + 2h). Bold clauses in that window.
      </p>
      {airports.map((b) => {
        const cat = worstCategoryInFlightWindow(b.taf, dep, enrouteMinutes);
        const depSnap = b.tafSnapshots?.dep;
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
            {b.taf?.rawTAF ? (
              <>
                {depSnap?.summary && (
                  <p className="mt-3 text-sm font-medium text-slate-100">
                    At dep: {depSnap.summary}
                  </p>
                )}
                <TafRawDisplay
                  taf={b.taf}
                  departureUtc={departureUtc}
                  enrouteMinutes={enrouteMinutes}
                />
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No TAF available</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function NotamCards({
  airports,
  departureUtc,
  enrouteMinutes,
}: {
  airports: AirportBriefing[];
  departureUtc: string;
  enrouteMinutes: number;
}) {
  const winEndMin = enrouteMinutes + 120;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Bold = validity overlaps flight window (dep → +{winEndMin} min incl. +2h). Closures / ILS U/S in
        bold red; NOT AUTH and LDA/TODA/ASDA orange; RSC 6 green, 5 blue, 3–4 yellow, 1–2 red.
      </p>
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
                        className="rounded-lg bg-slate-950/80 px-2.5 py-2 ring-1 ring-slate-800"
                      >
                        <NotamDisplay
                          notam={n}
                          departureUtc={departureUtc}
                          enrouteMinutes={enrouteMinutes}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {!NOTAM_GROUP_ORDER.some((g) => (b.notamsByGroup[g] || []).length) && (
              <p className="text-sm text-slate-500">
                No grouped NOTAMs (RUNWAYS / TAXIWAYS / APPROACH / FUEL / LIGHTING). Crane, birds, and
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
  const [atisLink, setAtisLink] = useState<AtisLink | null>(null);

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
        {tab === "metars" && (
          <MetarCards airports={data.airports} onOpenAtis={setAtisLink} />
        )}
        {tab === "tafs" && (
          <TafCards
            airports={data.airports}
            departureUtc={data.departureUtc}
            enrouteMinutes={data.enrouteMinutes}
          />
        )}
        {tab === "notams" && (
          <NotamCards
            airports={data.airports}
            departureUtc={data.departureUtc}
            enrouteMinutes={data.enrouteMinutes}
          />
        )}
      </div>

      <p className="text-[10px] leading-relaxed text-slate-600">{data.coverageNote}</p>
      <p className="text-[10px] text-slate-600">
        NOTAM source: {data.notamSource} · Generated {formatUtc(data.generatedAt)}
      </p>

      <AtisSheet link={atisLink} onClose={() => setAtisLink(null)} />
    </div>
  );
}
