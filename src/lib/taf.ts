import { categoryFromTafPeriod } from "./flightCategory";
import {
  ensureTafFcsts,
  flightWindowUnix,
  periodOverlapsWindow,
} from "./taf-parse";
import type {
  FlightCategory,
  TafData,
  TafHorizonKey,
  TafPeriod,
  TafSnapshot,
} from "./types";

export const HORIZON_HOURS: { key: TafHorizonKey; hours: number; label: string }[] = [
  { key: "dep", hours: 0, label: "TAF @ dep" },
  { key: "plus6", hours: 6, label: "+6h" },
  { key: "plus12", hours: 12, label: "+12h" },
  { key: "plus18", hours: 18, label: "+18h" },
  { key: "plus24", hours: 24, label: "+24h" },
];

const CATEGORY_RANK: Record<FlightCategory, number> = {
  LIFR: 4,
  IFR: 3,
  MVFR: 2,
  VFR: 1,
  UNK: 0,
};

export function horizonTimes(departureUtc: Date) {
  return HORIZON_HOURS.map((h) => ({
    key: h.key,
    label: h.label,
    atUtc: new Date(departureUtc.getTime() + h.hours * 3600_000).toISOString(),
    hours: h.hours,
  }));
}

/** Find the TAF forecast period governing a given instant (unix seconds). */
export function periodAt(taf: TafData | null, atUnixSec: number): TafPeriod | null {
  if (!taf?.fcsts?.length) return null;
  // Prefer non-PROB periods that contain the time; BECMG uses timeFrom→timeTo with timeBec
  const containing = taf.fcsts.filter(
    (p) => p.timeFrom <= atUnixSec && atUnixSec < p.timeTo
  );
  if (!containing.length) {
    // If outside all periods, pick nearest previous
    const prev = [...taf.fcsts]
      .filter((p) => p.timeFrom <= atUnixSec)
      .sort((a, b) => b.timeFrom - a.timeFrom)[0];
    return prev || null;
  }
  // Prefer base / FM / BECMG over PROB/TEMPO when overlapping for primary category,
  // but TEMPO without probability is still a real change — prefer most recent prevailing
  const prevailing = containing.filter(
    (p) => !p.probability && (!p.fcstChange || p.fcstChange === "FM" || p.fcstChange === "BECMG" || p.fcstChange === "BASE" || !p.fcstChange)
  );
  // Treat null fcstChange as BASE
  const baseOrFm = containing.filter(
    (p) =>
      !p.probability &&
      (p.fcstChange == null ||
        p.fcstChange === "FM" ||
        p.fcstChange === "BECMG" ||
        p.fcstChange === "BASE")
  );
  const pool = baseOrFm.length ? baseOrFm : prevailing.length ? prevailing : containing.filter((p) => !p.probability);
  const use = pool.length ? pool : containing;
  // Most recently started
  return use.sort((a, b) => b.timeFrom - a.timeFrom)[0];
}

export function summarizePeriod(period: TafPeriod | null): string {
  if (!period) return "No TAF period for this horizon";
  const bits: string[] = [];
  if (period.fcstChange) {
    bits.push(
      period.probability
        ? `PROB${period.probability} ${period.fcstChange}`
        : period.fcstChange
    );
  }
  const wind =
    period.wdir != null && period.wspd != null
      ? `${period.wdir === "VRB" ? "VRB" : String(period.wdir).padStart(3, "0")}${String(period.wspd).padStart(2, "0")}${
          period.wgst ? `G${period.wgst}` : ""
        }KT`
      : null;
  if (wind) bits.push(wind);
  if (period.visib != null) {
    bits.push(typeof period.visib === "number" ? `${period.visib}SM` : String(period.visib));
  }
  if (period.wxString) bits.push(period.wxString);
  if (period.clouds?.length) {
    bits.push(
      period.clouds
        .map((c) => `${c.cover}${c.base != null ? String(Math.round(c.base / 100)).padStart(3, "0") : ""}`)
        .join(" ")
    );
  } else if (period.vertVis != null) {
    bits.push(`VV${String(Math.round(period.vertVis / 100)).padStart(3, "0")}`);
  }
  return bits.join(" ") || "Conditions as forecast";
}

/**
 * Worst FAA category among TAF periods overlapping the flight window
 * (dep → enroute + 2h). Falls back to category at dep when nothing overlaps.
 */
export function worstCategoryInFlightWindow(
  taf: TafData | null,
  departureUtc: Date,
  enrouteMinutes: number
): FlightCategory {
  const enriched = ensureTafFcsts(taf);
  if (!enriched?.fcsts?.length) return "UNK";
  const win = flightWindowUnix(departureUtc, enrouteMinutes);
  let worst: FlightCategory = "UNK";
  for (const p of enriched.fcsts) {
    if (!periodOverlapsWindow(p, win)) continue;
    const cat = categoryFromTafPeriod(p);
    if (CATEGORY_RANK[cat] > CATEGORY_RANK[worst]) worst = cat;
  }
  if (worst !== "UNK") return worst;
  const atSec = Math.floor(departureUtc.getTime() / 1000);
  return categoryFromTafPeriod(periodAt(enriched, atSec));
}

/**
 * Build horizon snapshots. When rawTAF is present but fcsts empty (tgftp/CFPS),
 * parse the raw bulletin so categories/summaries work.
 * Kept for dep-time summary / tests; UI no longer switches horizon tabs.
 */
export function buildTafSnapshots(
  taf: TafData | null,
  departureUtc: Date
): Record<TafHorizonKey, TafSnapshot | null> {
  const enriched = ensureTafFcsts(taf);
  const out = {} as Record<TafHorizonKey, TafSnapshot | null>;
  const hadOnlyRaw = Boolean(taf?.rawTAF) && !taf?.fcsts?.length;
  for (const h of horizonTimes(departureUtc)) {
    const at = new Date(h.atUtc);
    const atSec = Math.floor(at.getTime() / 1000);
    const period = periodAt(enriched, atSec);
    const flightCategory: FlightCategory = categoryFromTafPeriod(period);
    out[h.key] = {
      horizon: h.key,
      atUtc: h.atUtc,
      period,
      flightCategory,
      summary: period
        ? summarizePeriod(period)
        : hadOnlyRaw
          ? "Could not parse TAF periods — showing raw text"
          : "No TAF period for this horizon",
      rawFragment: hadOnlyRaw && !period ? taf!.rawTAF : undefined,
    };
  }
  return out;
}

export { ensureTafFcsts };
