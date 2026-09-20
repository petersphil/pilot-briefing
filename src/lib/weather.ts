import { nativeAwareFetch } from "./http";
import type { MetarData, TafData } from "./types";

const AWC_BASE = "https://aviationweather.gov/api/data";
const TGFTP_METAR =
  "https://tgftp.nws.noaa.gov/data/observations/metar/stations";
const TGFTP_TAF =
  "https://tgftp.nws.noaa.gov/data/forecasts/taf/stations";
const VATSIM_METAR = "https://metar.vatsim.net";

const UA =
  "PilotBriefing/1.0 (+https://github.com/petersphil/pilot-briefing; contact via GitHub)";

async function awcFetch(path: string): Promise<Response> {
  return nativeAwareFetch(`${AWC_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": UA,
    },
    cache: "no-store",
  });
}

async function textFetch(url: string): Promise<Response> {
  return nativeAwareFetch(url, {
    headers: {
      Accept: "text/plain,*/*",
      "User-Agent": UA,
    },
    cache: "no-store",
  });
}

/** Parse tgftp timestamp line `YYYY/MM/DD HH:MM` → ISO UTC. */
function tgftpTimestampToIso(line: string): string | undefined {
  const m = line.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`;
}

/**
 * Split tgftp station file: optional timestamp first line, remainder is body.
 */
function splitTgftpBody(text: string): { stamp?: string; body: string } {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  if (!lines.length) return { body: "" };
  if (/^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}/.test(lines[0].trim())) {
    return {
      stamp: tgftpTimestampToIso(lines[0]),
      body: lines.slice(1).join("\n").trim(),
    };
  }
  return { body: lines.join("\n").trim() };
}

async function fetchMetarTgftp(icao: string): Promise<MetarData | null> {
  try {
    const res = await textFetch(`${TGFTP_METAR}/${icao}.TXT`);
    if (!res.ok) return null;
    const text = await res.text();
    const { stamp, body } = splitTgftpBody(text);
    if (!body) return null;
    // Prefer the observation line that starts with the ICAO
    const rawOb =
      body
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.toUpperCase().startsWith(icao)) || body.replace(/\s+/g, " ").trim();
    return {
      icaoId: icao,
      rawOb,
      reportTime: stamp,
    };
  } catch {
    return null;
  }
}

async function fetchMetarVatsim(icao: string): Promise<MetarData | null> {
  try {
    const res = await textFetch(`${VATSIM_METAR}/${icao}`);
    if (!res.ok) return null;
    const rawOb = (await res.text()).trim();
    if (!rawOb || rawOb.toLowerCase().includes("not found")) return null;
    return { icaoId: icao, rawOb };
  } catch {
    return null;
  }
}

async function fetchTafTgftp(icao: string): Promise<TafData | null> {
  try {
    const res = await textFetch(`${TGFTP_TAF}/${icao}.TXT`);
    if (!res.ok) return null;
    const text = await res.text();
    const { stamp, body } = splitTgftpBody(text);
    if (!body) return null;
    // Collapse soft line wraps but keep readable spacing
    const rawTAF = body.replace(/\n\s+/g, " ").replace(/\s+/g, " ").trim();
    return {
      icaoId: icao,
      rawTAF,
      issueTime: stamp,
      // No structured fcsts — BriefingResults shows raw TAF when periods missing
    };
  } catch {
    return null;
  }
}

async function fetchMetarsFromAwc(icaos: string[]): Promise<Map<string, MetarData>> {
  const map = new Map<string, MetarData>();
  const ids = icaos.join(",");
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

async function fetchTafsFromAwc(icaos: string[]): Promise<Map<string, TafData>> {
  const map = new Map<string, TafData>();
  const ids = icaos.join(",");
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
 * METAR: try AWC JSON first; on any failure or missing station, fall back to
 * NOAA tgftp, then VATSIM. SSL verification stays enabled (no trust-all).
 */
export async function fetchMetars(icaos: string[]): Promise<Map<string, MetarData>> {
  const map = new Map<string, MetarData>();
  if (!icaos.length) return map;
  const unique = Array.from(new Set(icaos.map((c) => c.toUpperCase())));

  try {
    const awc = await fetchMetarsFromAwc(unique);
    awc.forEach((v, k) => map.set(k, v));
  } catch {
    // AWC TLS/network/HTTP failure — fill entirely from fallbacks below
  }

  const missing = unique.filter((icao) => !map.has(icao));
  await Promise.all(
    missing.map(async (icao) => {
      const fromTgftp = await fetchMetarTgftp(icao);
      if (fromTgftp) {
        map.set(icao, fromTgftp);
        return;
      }
      const fromVatsim = await fetchMetarVatsim(icao);
      if (fromVatsim) map.set(icao, fromVatsim);
    })
  );

  return map;
}

/**
 * TAF: try AWC JSON first; on any failure or missing station, fall back to
 * NOAA tgftp (raw TAF only — no structured fcsts).
 */
export async function fetchTafs(icaos: string[]): Promise<Map<string, TafData>> {
  const map = new Map<string, TafData>();
  if (!icaos.length) return map;
  const unique = Array.from(new Set(icaos.map((c) => c.toUpperCase())));

  try {
    const awc = await fetchTafsFromAwc(unique);
    awc.forEach((v, k) => map.set(k, v));
  } catch {
    // AWC TLS/network/HTTP failure — fill from tgftp below
  }

  const missing = unique.filter((icao) => !map.has(icao));
  await Promise.all(
    missing.map(async (icao) => {
      const fromTgftp = await fetchTafTgftp(icao);
      if (fromTgftp) map.set(icao, fromTgftp);
    })
  );

  return map;
}

/**
 * Coverage notes for operators.
 * AWC METAR/TAF: worldwide (includes Canada & Caribbean) via ICAO stations.
 * When AWC TLS/HTTP fails, METAR/TAF fall back to NOAA tgftp (VATSIM for METAR).
 */
export const COVERAGE_NOTE =
  "METAR/TAF via aviationweather.gov (FAA AWC) when TLS is healthy; on AWC failure falls back to NOAA tgftp " +
  "(tgftp.nws.noaa.gov) and VATSIM METAR. Worldwide station coverage including Canada and Caribbean. " +
  "NOTAMs: Canadian airports (iso_country CA) via NAV CANADA CFPS (no key); all other airports via SkyLink on RapidAPI (RAPIDAPI_KEY or device Settings key).";
