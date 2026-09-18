import type { MetarData, TafData } from "./types";

const AWC_BASE = process.env.AWC_API_BASE || "https://aviationweather.gov/api/data";
const UA =
  process.env.AWC_USER_AGENT ||
  "PilotBriefing/1.0 (+https://github.com/petersphil/pilot-briefing; contact via GitHub)";

async function awcFetch(path: string): Promise<Response> {
  return fetch(`${AWC_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": UA,
    },
    cache: "no-store",
  });
}

export async function fetchMetars(icaos: string[]): Promise<Map<string, MetarData>> {
  const map = new Map<string, MetarData>();
  if (!icaos.length) return map;
  const ids = Array.from(new Set(icaos.map((c) => c.toUpperCase()))).join(",");
  const res = await awcFetch(`/metar?ids=${encodeURIComponent(ids)}&format=json`);
  if (res.status === 204) return map;
  if (!res.ok) {
    throw new Error(`AWC METAR HTTP ${res.status}`);
  }
  const data = (await res.json()) as MetarData[] | MetarData;
  const list = Array.isArray(data) ? data : data ? [data] : [];
  for (const m of list) {
    if (m?.icaoId) map.set(m.icaoId.toUpperCase(), m);
  }
  return map;
}

export async function fetchTafs(icaos: string[]): Promise<Map<string, TafData>> {
  const map = new Map<string, TafData>();
  if (!icaos.length) return map;
  const ids = Array.from(new Set(icaos.map((c) => c.toUpperCase()))).join(",");
  const res = await awcFetch(`/taf?ids=${encodeURIComponent(ids)}&format=json`);
  if (res.status === 204) return map;
  if (!res.ok) {
    throw new Error(`AWC TAF HTTP ${res.status}`);
  }
  const data = (await res.json()) as TafData[] | TafData;
  const list = Array.isArray(data) ? data : data ? [data] : [];
  for (const t of list) {
    if (t?.icaoId) map.set(t.icaoId.toUpperCase(), t);
  }
  return map;
}

/**
 * Coverage notes for operators.
 * AWC METAR/TAF: worldwide (includes Canada & Caribbean) via ICAO stations.
 */
export const COVERAGE_NOTE =
  "METAR/TAF via aviationweather.gov (FAA AWC) — worldwide station coverage including Canada and Caribbean. " +
  "NOTAMs: US via optional FAA NOTAM API credentials; Canadian / many Caribbean NOTAMs are not fully available without NAV CANADA or local AIS sources.";
