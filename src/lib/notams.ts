import { lookupIcao } from "./airports";
import { nativeAwareFetch } from "./http";
import type { NotamGroup, NotamItem } from "./types";

/** Options for client or server callers (avoid raw process.env on client). */
export interface NotamFetchOptions {
  rapidApiKey?: string;
  enableSampleNotams?: boolean;
}

/** Ordered groups for UI. */
export const NOTAM_GROUP_ORDER: NotamGroup[] = [
  "runway",
  "taxiway",
  "fuel",
  "ifr_approach",
  "lighting",
];

export const NOTAM_GROUP_LABELS: Record<NotamGroup, string> = {
  runway: "Runway closures / construction / shortening / restrictions",
  taxiway: "Taxiway",
  fuel: "Fuel / fueler",
  ifr_approach: "IFR approach restrictions / limitations",
  lighting: "Airport / approach lighting",
  other: "Other (filtered out of primary view)",
};

/** Exclude crane, birds, wildlife per requirements. */
const EXCLUDE_PATTERNS = [
  /\bcrane\b/i,
  /\bcranes\b/i,
  /\bbird\b/i,
  /\bbirds\b/i,
  /\bwildlife\b/i,
  /\bbird\s*hazard\b/i,
  /\bbird\s*activity\b/i,
];

const RUNWAY_RE =
  /\b(RWY|RUNWAY|RWYS|RUNWAYS)\b.*\b(CLSD|CLOSED|CLOSURE|CONSTRUCTION|WIP|SHORTEN|SHORTENED|LENGTH|RESTRICT|RESTRICTION|NOT\s+AVBL|UNUSABLE|CLOSED\s+TO)\b|\b(CLSD|CLOSED|CONSTRUCTION|WIP|SHORTEN|SHORTENED|RESTRICT|RESTRICTION|NOT\s+AVBL)\b.*\b(RWY|RUNWAY|RWYS)\b/i;

const TAXIWAY_RE = /\b(TWY|TAXIWAY|TAXIWAYS|TWYS)\b/i;

const FUEL_RE = /\b(FUEL|FUELER|FUELLING|FUELING|100LL|JET\s*A|FBO\s*FUEL|NO\s+FUEL)\b/i;

const IFR_RE =
  /\b(ILS|LOC|LDA|SDF|VOR|RNAV|RNP|GPS|APPROACH|APCH|IAP|MISSED\s+APPROACH|PROCEDURE)\b.*\b(U\/S|UNSERVICEABLE|OUT\s+OF\s+SERVICE|NOT\s+AVBL|NA|RESTRICT|LIMIT|CLOSED|CLSD)\b|\b(U\/S|UNSERVICEABLE|NOT\s+AVBL)\b.*\b(ILS|LOC|APPROACH|APCH|RNAV|VOR)\b|\bCAT\s*(II|III|IIIA|IIIB|IIIC)\b/i;

const LIGHTING_RE =
  /\b(ALSF|SSALR|MALSR|MALSF|ODALS|REIL|PAPI|VASI|HIRL|MIRL|LIRL|APPROACH\s+LIGHT|APCH\s+LIGHT|RWY\s+LIGHT|RUNWAY\s+LIGHT|TWY\s+LIGHT|AIRPORT\s+LIGHT|LIGHTING|LGTS|LIGHTS)\b/i;

export function shouldExcludeNotam(text: string): boolean {
  return EXCLUDE_PATTERNS.some((re) => re.test(text));
}

export function classifyNotam(text: string): NotamGroup {
  // IFR approach and lighting before runway: bare "RWY nn" must not steal ILS/ALSF NOTAMs
  if (IFR_RE.test(text)) return "ifr_approach";
  if (LIGHTING_RE.test(text)) return "lighting";
  if (RUNWAY_RE.test(text)) return "runway";
  if (TAXIWAY_RE.test(text)) return "taxiway";
  if (FUEL_RE.test(text)) return "fuel";
  return "other";
}

export function groupNotams(items: NotamItem[]): Record<NotamGroup, NotamItem[]> {
  const out: Record<NotamGroup, NotamItem[]> = {
    runway: [],
    taxiway: [],
    fuel: [],
    ifr_approach: [],
    lighting: [],
    other: [],
  };
  for (const n of items) {
    if (n.excluded) continue;
    out[n.group].push(n);
  }
  return out;
}

function toNotamItem(
  icao: string,
  id: string,
  text: string,
  start: string | null,
  end: string | null
): NotamItem {
  const raw = String(text || "").trim();
  const excluded = shouldExcludeNotam(raw);
  return {
    id,
    icao,
    raw,
    text: raw,
    group: classifyNotam(raw),
    start,
    end,
    excluded,
  };
}

/** Airport.country is ISO country (OurAirports); treat as iso_country. */
export function isCanadianAirport(icao: string): boolean {
  const a = lookupIcao(icao);
  if (a?.country) return a.country.toUpperCase() === "CA";
  return /^C[A-Z0-9]{3}$/i.test(icao) && !/^CA\d{2}$/i.test(icao);
}

function parseNavCanadaText(text: unknown): string {
  if (text == null) return "";
  if (typeof text !== "string") return String(text);
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return trimmed;
  try {
    const obj = JSON.parse(trimmed) as {
      english?: string | null;
      raw?: string | null;
      french?: string | null;
    };
    return (
      (obj.english && String(obj.english).trim()) ||
      (obj.raw && String(obj.raw).trim()) ||
      (obj.french && String(obj.french).trim()) ||
      trimmed
    );
  } catch {
    return trimmed;
  }
}

function normalizeNavCanadaItems(icao: string, payload: unknown): NotamItem[] {
  const items: NotamItem[] = [];
  const root = payload as { data?: unknown[] };
  const list = Array.isArray(root?.data) ? root.data : [];

  for (const entry of list) {
    const e = entry as Record<string, unknown>;
    if (e.type && e.type !== "notam") continue;
    const text = parseNavCanadaText(e.text);
    if (!text) continue;
    const id = String(e.pk || e.id || `${icao}-${items.length + 1}`);
    items.push(
      toNotamItem(
        icao,
        id,
        text,
        e.startValidity != null ? String(e.startValidity) : null,
        e.endValidity != null ? String(e.endValidity) : null
      )
    );
  }
  return items;
}

async function fetchNavCanadaNotams(icao: string): Promise<NotamItem[]> {
  const url = new URL("https://plan.navcanada.ca/weather/api/alpha/");
  url.searchParams.set("site", icao.toUpperCase());
  url.searchParams.set("alpha", "notam");
  url.searchParams.set("notam_choice", "default");

  const res = await nativeAwareFetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
      Referer: "https://plan.navcanada.ca/wxrecall/",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Nav Canada NOTAM HTTP ${res.status} for ${icao}`);
  }
  const data = await res.json();
  return normalizeNavCanadaItems(icao, data);
}

/** Server-only helper: read RapidAPI key from env when options omit it. */
export function rapidApiKeyFromEnv(): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  return (
    process.env.RAPIDAPI_KEY?.trim() ||
    process.env.SKYLINK_RAPIDAPI_KEY?.trim() ||
    undefined
  );
}

export function enableSampleNotamsFromEnv(): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  return process.env.ENABLE_SAMPLE_NOTAMS === "1";
}

interface SkyLinkNotamEntry {
  raw?: string;
  body?: string;
  notam_id?: string | null;
  notam_id_domestic?: string | null;
  effective?: string | null;
  expiration?: string | null;
  location?: string | null;
}

function normalizeSkyLinkItems(icao: string, payload: unknown): NotamItem[] {
  const items: NotamItem[] = [];
  const root = payload as Record<string, unknown>;
  const list =
    (root?.notams as unknown[]) ||
    (root?.notamList as unknown[]) ||
    (Array.isArray(payload) ? (payload as unknown[]) : []);

  for (const entry of list) {
    if (typeof entry === "string") {
      if (!entry.trim()) continue;
      items.push(toNotamItem(icao, `${icao}-${items.length + 1}`, entry, null, null));
      continue;
    }
    const e = entry as SkyLinkNotamEntry;
    const text = (e.body && String(e.body).trim()) || (e.raw && String(e.raw).trim()) || "";
    if (!text) continue;
    const id = String(
      e.notam_id || e.notam_id_domestic || `${icao}-${items.length + 1}`
    );
    items.push(
      toNotamItem(
        icao,
        id,
        text,
        e.effective != null ? String(e.effective) : null,
        e.expiration != null ? String(e.expiration) : null
      )
    );
  }
  return items;
}

async function fetchSkyLinkNotams(icao: string, apiKey: string): Promise<NotamItem[]> {
  const url = `https://skylink-api.p.rapidapi.com/v3/notams/${encodeURIComponent(
    icao.toUpperCase()
  )}`;
  const res = await nativeAwareFetch(url, {
    headers: {
      Accept: "application/json",
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": "skylink-api.p.rapidapi.com",
    },
    cache: "no-store",
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    throw new Error(`SkyLink NOTAM HTTP ${res.status} for ${icao}`);
  }
  const data = await res.json();
  return normalizeSkyLinkItems(icao, data);
}

/** Sample NOTAMs for UI/dev when enableSampleNotams */
function sampleNotams(icao: string): NotamItem[] {
  const samples = [
    `${icao} RWY 16/34 CLSD DUE TO CONSTRUCTION 1200-2200 DAILY`,
    `${icao} TWY A BETWEEN A1 AND A3 CLSD`,
    `${icao} FUEL 100LL NOT AVBL`,
    `${icao} ILS RWY 28 U/S`,
    `${icao} ALSF-2 RWY 10 OUT OF SERVICE`,
    `${icao} CRANE 1NM NE OF ARPT 250FT AGL`,
    `${icao} BIRD ACTIVITY IN VICINITY`,
  ];
  return samples.map((raw, i) => {
    const excluded = shouldExcludeNotam(raw);
    return {
      id: `SAMPLE-${icao}-${i}`,
      icao,
      raw,
      text: raw,
      group: classifyNotam(raw),
      start: null,
      end: null,
      excluded,
    };
  });
}

function keepPrimary(list: NotamItem[]): NotamItem[] {
  return list.filter((n) => !n.excluded);
}

export async function fetchNotams(
  icaos: string[],
  options: NotamFetchOptions = {}
): Promise<{ items: Map<string, NotamItem[]>; source: string; warnings: string[] }> {
  const items = new Map<string, NotamItem[]>();
  const warnings: string[] = [];
  const useSamples =
    options.enableSampleNotams ?? enableSampleNotamsFromEnv();
  const rapidKey =
    (options.rapidApiKey && options.rapidApiKey.trim()) ||
    // Only fall back to env on server; client must pass key via options
    (typeof window === "undefined" ? rapidApiKeyFromEnv() : undefined);
  const unique = Array.from(new Set(icaos.map((c) => c.toUpperCase())));

  const caIcaos = unique.filter(isCanadianAirport);
  const otherIcaos = unique.filter((c) => !isCanadianAirport(c));

  const sourcesUsed = new Set<string>();

  if (useSamples && !rapidKey && otherIcaos.length && !caIcaos.length) {
    for (const icao of unique) items.set(icao, keepPrimary(sampleNotams(icao)));
    warnings.push("Showing SAMPLE NOTAMs (enableSampleNotams). Not live data.");
    return { items, source: "sample", warnings };
  }

  if (otherIcaos.length && !rapidKey) {
    warnings.push(
      "NOTAMs: enter a RapidAPI key in Settings (or set RAPIDAPI_KEY on the server) for SkyLink NOTAMs on non-Canadian airports."
    );
  }

  await Promise.all(
    unique.map(async (icao) => {
      try {
        if (isCanadianAirport(icao)) {
          const list = await fetchNavCanadaNotams(icao);
          items.set(icao, keepPrimary(list));
          sourcesUsed.add("navcanada-cfps");
          return;
        }

        if (rapidKey) {
          const list = await fetchSkyLinkNotams(icao, rapidKey);
          items.set(icao, keepPrimary(list));
          sourcesUsed.add("skylink-rapidapi");
          return;
        }

        if (useSamples) {
          items.set(icao, keepPrimary(sampleNotams(icao)));
          sourcesUsed.add("sample");
          return;
        }

        items.set(icao, []);
      } catch (e) {
        warnings.push(`NOTAM fetch failed for ${icao}: ${(e as Error).message}`);
        if (useSamples) {
          items.set(icao, keepPrimary(sampleNotams(icao)));
          sourcesUsed.add("sample");
        } else {
          items.set(icao, []);
        }
      }
    })
  );

  if (useSamples && sourcesUsed.has("sample") && !warnings.some((w) => w.includes("SAMPLE"))) {
    warnings.push("Showing SAMPLE NOTAMs for some airports. Not live data.");
  }

  const source =
    sourcesUsed.size === 0 ? "none" : Array.from(sourcesUsed).sort().join("+");

  return { items, source, warnings };
}
