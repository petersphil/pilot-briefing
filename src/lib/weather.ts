import { isNativeApp, nativeAwareFetch } from "./http";
import { isCanadianAirport } from "./notams";
import type { MetarData, TafData } from "./types";

const AWC_BASE = "https://aviationweather.gov/api/data";
const TGFTP_METAR =
  "https://tgftp.nws.noaa.gov/data/observations/metar/stations";
const TGFTP_TAF =
  "https://tgftp.nws.noaa.gov/data/forecasts/taf/stations";
const VATSIM_METAR = "https://metar.vatsim.net";
const CFPS_ALPHA = "https://plan.navcanada.ca/weather/api/alpha/";

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


/** Collapse duplicate TAF keywords NOAA sometimes prefixes ("TAF TAF CYUL…"). */
function normalizeRawTaf(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\n\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:TAF\s+)+/i, "TAF ");
}

/** Bulletin issue group DDHHMMZ → ISO, anchored to calendar near `now` (not next month). */
function issueZToIso(issueZ: string, now = new Date()): string | undefined {
  const m = issueZ.trim().match(/^(\d{2})(\d{2})(\d{2})Z$/i);
  if (!m) return undefined;
  const day = +m[1];
  const hour = +m[2];
  const minute = +m[3];
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  const today = now.getUTCDate();
  // Day much ahead of today ⇒ previous month (e.g. 31 when today is 1)
  if (day > today + 1) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  return new Date(Date.UTC(year, month, day, hour, minute, 0)).toISOString();
}

/** Extract DDHHMMZ from raw TAF header. */
function bulletinIssueZ(rawTAF: string): string | undefined {
  const m = rawTAF.match(/\b([A-Z]{4})\s+(\d{6}Z)\b/i);
  return m ? m[2].toUpperCase() : undefined;
}

/**
 * True when bulletin validity end (DDHH of DDHH/DDHH) is clearly before ~now.
 * Used to reject stale tgftp Canadian TAFs (file stamp fresh, body days old).
 */
function tafBulletinLooksStale(rawTAF: string, now = new Date()): boolean {
  const m = rawTAF.match(/\b\d{6}Z\s+(\d{2})(\d{2})\/(\d{2})(\d{2})\b/i);
  if (!m) return false;
  const endDay = +m[3];
  const endHour = +m[4];
  const issueIso = (() => {
    const iz = bulletinIssueZ(rawTAF);
    return iz ? issueZToIso(iz, now) : undefined;
  })();
  const ref = issueIso ? new Date(issueIso) : now;
  // Reuse same month-roll rules as issueZ: end day < issue day ⇒ next month
  let year = ref.getUTCFullYear();
  let month = ref.getUTCMonth();
  const issueDay = ref.getUTCDate();
  if (endDay < issueDay) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  let h = endHour;
  let add = 0;
  if (h === 24) {
    h = 0;
    add = 1;
  }
  const endMs = Date.UTC(year, month, endDay, h, 0, 0) + add * 86400_000;
  // Stale if validity ended more than 2 hours ago
  return endMs < now.getTime() - 2 * 3600_000;
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
    const { body } = splitTgftpBody(text);
    if (!body) return null;
    const rawTAF = normalizeRawTaf(body);
    if (!rawTAF) return null;
    // Prefer bulletin DDHHMMZ over file stamp (stamp can be fresh while body is days old)
    const iz = bulletinIssueZ(rawTAF);
    const issueTime = iz ? issueZToIso(iz) : undefined;
    return {
      icaoId: icao,
      rawTAF,
      issueTime,
    };
  } catch {
    return null;
  }
}

/**
 * Nav Canada CFPS TAF for Canadian ICAOs (same alpha API as NOTAMs).
 * Response: data[].text is the raw TAF string.
 */
async function fetchTafCfps(icao: string): Promise<TafData | null> {
  try {
    const url = new URL(CFPS_ALPHA);
    url.searchParams.set("site", icao.toUpperCase());
    url.searchParams.set("alpha", "taf");
    url.searchParams.set("notam_choice", "default");

    const res = await nativeAwareFetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
        Referer: "https://plan.navcanada.ca/wxrecall/",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { data?: unknown[] };
    const list = Array.isArray(payload?.data) ? payload.data : [];
    for (const entry of list) {
      const e = entry as Record<string, unknown>;
      if (e.type && e.type !== "taf") continue;
      const raw =
        typeof e.text === "string"
          ? e.text.trim()
          : e.text != null
            ? String(e.text).trim()
            : "";
      if (!raw) continue;
      const rawTAF = normalizeRawTaf(raw.replace(/=\s*$/, ""));
      if (!rawTAF) continue;
      const iz = bulletinIssueZ(rawTAF);
      return {
        icaoId: icao,
        rawTAF,
        issueTime:
          (iz && issueZToIso(iz)) ||
          (e.startValidity != null ? String(e.startValidity) : undefined),
      };
    }
    return null;
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

async function fillMetarsFromFallbacks(
  map: Map<string, MetarData>,
  icaos: string[]
): Promise<void> {
  const missing = icaos.filter((icao) => !map.has(icao));
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
}

async function fillTafsFromFallbacks(
  map: Map<string, TafData>,
  icaos: string[]
): Promise<void> {
  const missing = icaos.filter((icao) => !map.has(icao));
  await Promise.all(
    missing.map(async (icao) => {
      // Canadian: CFPS first — NOAA tgftp often serves stale CA bulletins
      // (fresh file stamp, body still on an old DDHHMMZ).
      if (isCanadianAirport(icao)) {
        const fromCfps = await fetchTafCfps(icao);
        if (fromCfps) {
          map.set(icao, fromCfps);
          return;
        }
        const fromTgftp = await fetchTafTgftp(icao);
        if (fromTgftp && !tafBulletinLooksStale(fromTgftp.rawTAF)) {
          map.set(icao, fromTgftp);
        }
        return;
      }

      const fromTgftp = await fetchTafTgftp(icao);
      if (fromTgftp && !tafBulletinLooksStale(fromTgftp.rawTAF)) {
        map.set(icao, fromTgftp);
      }
    })
  );
}

/**
 * METAR: on Capacitor native skip AWC (avoids aviationweather.gov TLS on device);
 * use NOAA tgftp then VATSIM. On server/browser try AWC first, then same fallbacks.
 * Never throws — always returns a Map (possibly empty). SSL verification stays on.
 */
export async function fetchMetars(icaos: string[]): Promise<Map<string, MetarData>> {
  const map = new Map<string, MetarData>();
  try {
    if (!icaos.length) return map;
    const unique = Array.from(new Set(icaos.map((c) => c.toUpperCase())));

    if (!isNativeApp()) {
      try {
        const awc = await fetchMetarsFromAwc(unique);
        awc.forEach((v, k) => map.set(k, v));
      } catch {
        // AWC TLS/network/HTTP failure — fill from fallbacks below
      }
    }

    await fillMetarsFromFallbacks(map, unique);
  } catch {
    // Outer guard: never reject the promise
  }
  return map;
}

/**
 * TAF: on Capacitor native skip AWC; Canadian ICAOs use Nav Canada CFPS first
 * (tgftp CA files are often stale), then tgftp; other ICAOs use tgftp.
 * On server/browser try AWC first, then same fallbacks.
 * Never throws — always returns a Map (possibly empty). SSL verification stays on.
 */
export async function fetchTafs(icaos: string[]): Promise<Map<string, TafData>> {
  const map = new Map<string, TafData>();
  try {
    if (!icaos.length) return map;
    const unique = Array.from(new Set(icaos.map((c) => c.toUpperCase())));

    if (!isNativeApp()) {
      try {
        const awc = await fetchTafsFromAwc(unique);
        awc.forEach((v, k) => map.set(k, v));
      } catch {
        // AWC TLS/network/HTTP failure — fill from fallbacks below
      }
    }

    await fillTafsFromFallbacks(map, unique);
  } catch {
    // Outer guard: never reject the promise
  }
  return map;
}

/**
 * Coverage notes for operators.
 * Native (Capacitor): METAR/TAF via NOAA tgftp (+ VATSIM METAR; CFPS TAF for CA).
 * Server/browser: AWC when TLS healthy, same fallbacks otherwise.
 */
export const COVERAGE_NOTE =
  "METAR on native apps: NOAA tgftp (+ VATSIM). TAF on native: Nav Canada CFPS for Canadian " +
  "ICAOs first (NOAA tgftp CA TAF files are often stale), else NOAA tgftp — aviationweather.gov " +
  "is not called on device. On server/browser, AWC is tried first when TLS is healthy, then the same fallbacks. " +
  "Worldwide station coverage including Canada and Caribbean. " +
  "NOTAMs: Canadian airports (iso_country CA) via NAV CANADA CFPS (no key); all other airports via SkyLink on RapidAPI (RAPIDAPI_KEY or device Settings key).";
