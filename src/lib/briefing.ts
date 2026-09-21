import { resolveLeg, sortWestToEast } from "./airports";
import { categoryFromMetar } from "./flightCategory";
import { groupNotams, fetchNotams, type NotamFetchOptions } from "./notams";
import { buildTafSnapshots, horizonTimes } from "./taf";
import { ensureTafFcsts } from "./taf-parse";
import type { BriefingRequest, BriefingResponse, AirportBriefing } from "./types";
import { COVERAGE_NOTE, fetchMetars, fetchTafs } from "./weather";

export type BriefingOptions = NotamFetchOptions;

export async function buildBriefing(
  req: BriefingRequest,
  options: BriefingOptions = {}
): Promise<BriefingResponse> {
  const warnings: string[] = [];
  const { airports: resolved, errors } = resolveLeg(
    req.departure,
    req.destination,
    req.alternates || []
  );
  warnings.push(...errors);

  if (!resolved.length) {
    return {
      generatedAt: new Date().toISOString(),
      departureUtc: req.departureUtc,
      enrouteMinutes: req.enrouteMinutes,
      airports: [],
      sortedWestToEast: [],
      horizons: horizonTimes(new Date(req.departureUtc)),
      notamSource: "none",
      warnings,
      coverageNote: COVERAGE_NOTE,
    };
  }

  const depDate = new Date(req.departureUtc);
  if (Number.isNaN(depDate.getTime())) {
    throw new Error("Invalid departureUtc — use ISO-8601 UTC (e.g. 2026-09-18T15:00:00Z)");
  }

  const icaos = resolved.map((a) => a.icao);
  const [metars, tafs, notamResult] = await Promise.all([
    fetchMetars(icaos).catch((e: Error) => {
      warnings.push(`METAR fetch failed: ${e.message}`);
      return new Map();
    }),
    fetchTafs(icaos).catch((e: Error) => {
      warnings.push(`TAF fetch failed: ${e.message}`);
      return new Map();
    }),
    fetchNotams(icaos, options),
  ]);
  warnings.push(...notamResult.warnings);

  const sorted = sortWestToEast(resolved);
  const briefings: AirportBriefing[] = sorted.map((airport) => {
    const metar = metars.get(airport.icao) || null;
    const tafRaw = tafs.get(airport.icao) || null;
    // Fill fcsts from raw TAF when AWC structured periods missing (Android tgftp/CFPS)
    const taf = ensureTafFcsts(tafRaw);
    const notams = (notamResult.items.get(airport.icao) || []).filter(
      (n) => n.group !== "other"
    );
    const errs: string[] = [];
    if (!metar) errs.push("No METAR");
    if (!taf) errs.push("No TAF");
    return {
      airport,
      metar,
      taf,
      flightCategory: categoryFromMetar(metar),
      tafSnapshots: buildTafSnapshots(taf, depDate),
      notams,
      notamsByGroup: groupNotams(notams),
      errors: errs,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    departureUtc: depDate.toISOString(),
    enrouteMinutes: req.enrouteMinutes,
    airports: briefings,
    sortedWestToEast: sorted.map((a) => a.icao),
    horizons: horizonTimes(depDate),
    notamSource: notamResult.source,
    warnings,
    coverageNote: COVERAGE_NOTE,
  };
}
