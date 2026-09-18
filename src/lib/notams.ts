import type { NotamGroup, NotamItem } from "./types";

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
  /\b(RWY|RUNWAY|RWYS|RUNWAYS)\b.*\b(CLSD|CLOSED|CLOSURE|CONSTRUCTION|WIP|SHORTEN|SHORTENED|LENGTH|RESTRICT|RESTRICTION|NOT\s+AVBL|UNUSABLE|CLOSED\s+TO)\b|\b(CLSD|CLOSED|CONSTRUCTION|WIP|SHORTEN)\b.*\b(RWY|RUNWAY)\b|\bRWY\s*\d{2}/i;

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
  if (RUNWAY_RE.test(text)) return "runway";
  if (TAXIWAY_RE.test(text)) return "taxiway";
  if (FUEL_RE.test(text)) return "fuel";
  if (IFR_RE.test(text)) return "ifr_approach";
  if (LIGHTING_RE.test(text)) return "lighting";
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

interface FaaNotamCore {
  id?: string;
  notamNumber?: string;
  icaoLocation?: string;
  domesticLocation?: string;
  text?: string;
  traditionalMessage?: string;
  plainTextMessage?: string;
  plainLanguage?: string;
  effectiveStart?: string;
  effectiveEnd?: string;
  startDate?: string;
  endDate?: string;
}

function normalizeFaaItems(icao: string, payload: unknown): NotamItem[] {
  const items: NotamItem[] = [];
  const root = payload as Record<string, unknown>;
  const list =
    (root?.notamList as unknown[]) ||
    (root?.items as unknown[]) ||
    (Array.isArray(payload) ? (payload as unknown[]) : []);

  for (const entry of list) {
    const e = entry as Record<string, unknown>;
    const core = (e.properties || e.notam || e) as FaaNotamCore;
    const text =
      core.plainTextMessage ||
      core.plainLanguage ||
      core.text ||
      core.traditionalMessage ||
      (typeof e === "string" ? e : "") ||
      "";
    if (!text) continue;
    const raw = String(text);
    const excluded = shouldExcludeNotam(raw);
    const group = classifyNotam(raw);
    items.push({
      id: String(core.id || core.notamNumber || `${icao}-${items.length + 1}`),
      icao,
      raw,
      text: raw,
      group,
      start: core.effectiveStart || core.startDate || null,
      end: core.effectiveEnd || core.endDate || null,
      excluded,
    });
  }
  return items;
}

async function fetchFaaNotamsForIcao(icao: string): Promise<NotamItem[]> {
  const clientId = process.env.FAA_NOTAM_CLIENT_ID;
  const clientSecret = process.env.FAA_NOTAM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return [];
  }

  const tokenUrl =
    process.env.FAA_NOTAM_TOKEN_URL ||
    "https://external-api.faa.gov/oauth2/token";
  const apiBase =
    process.env.FAA_NOTAM_API_BASE || "https://external-api.faa.gov/notamapi/v1";

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) {
    throw new Error(`FAA NOTAM token HTTP ${tokenRes.status}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new Error("FAA NOTAM token missing");

  const url = new URL(`${apiBase}/notams`);
  url.searchParams.set("icaoLocation", icao);
  url.searchParams.set("pageSize", "200");
  url.searchParams.set("pageNum", "1");
  url.searchParams.set("responseFormat", "aidap");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      Accept: "application/json",
    },
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    throw new Error(`FAA NOTAM HTTP ${res.status} for ${icao}`);
  }
  const data = await res.json();
  return normalizeFaaItems(icao, data);
}

/** Sample NOTAMs for UI/dev when ENABLE_SAMPLE_NOTAMS=1 */
function sampleNotams(icao: string): NotamItem[] {
  const samples = [
    `${icao} RWY 16/34 CLSD DUE TO CONSTRUCTION 1200-2200 DAILY`,
    `${icao} TWY A BETWEEN A1 AND A3 CLSD`,
    `${icao} FUEL 100LL NOT AVBL`,
    `${icao} ILS RWY 28 U/S`,
    `${icao} ALSF-2 RWY 10 OUT OF SERVICE`,
    `${icao} CRANE 1NM NE OF ARPT 250FT AGL`, // excluded
    `${icao} BIRD ACTIVITY IN VICINITY`, // excluded
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

export async function fetchNotams(
  icaos: string[]
): Promise<{ items: Map<string, NotamItem[]>; source: string; warnings: string[] }> {
  const items = new Map<string, NotamItem[]>();
  const warnings: string[] = [];
  const hasCreds = !!(process.env.FAA_NOTAM_CLIENT_ID && process.env.FAA_NOTAM_CLIENT_SECRET);
  const useSamples = process.env.ENABLE_SAMPLE_NOTAMS === "1";

  if (!hasCreds && !useSamples) {
    warnings.push(
      "NOTAMs: set FAA_NOTAM_CLIENT_ID and FAA_NOTAM_CLIENT_SECRET for US FAA NOTAM API access. Canadian NOTAMs require NAV CANADA (not bundled)."
    );
    for (const icao of icaos) items.set(icao, []);
    return { items, source: "none", warnings };
  }

  if (useSamples && !hasCreds) {
    for (const icao of icaos) items.set(icao, sampleNotams(icao));
    warnings.push("Showing SAMPLE NOTAMs (ENABLE_SAMPLE_NOTAMS=1). Not live data.");
    return { items, source: "sample", warnings };
  }

  for (const icao of icaos) {
    try {
      const list = await fetchFaaNotamsForIcao(icao);
      // Filter: keep classified groups; drop excluded + pure other from primary
      items.set(
        icao,
        list.filter((n) => !n.excluded)
      );
    } catch (e) {
      warnings.push(`NOTAM fetch failed for ${icao}: ${(e as Error).message}`);
      items.set(icao, []);
    }
  }
  return { items, source: "faa-notam-api", warnings };
}
