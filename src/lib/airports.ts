import airportsJson from "../../data/airports.json";
import type { Airport, AirportRole, ResolvedAirport } from "./types";

interface AirportDb {
  airports: Airport[];
  iataToIcao: Record<string, string>;
  aliases?: Record<string, string>;
  meta?: Record<string, unknown>;
}

const db = airportsJson as AirportDb;
const byIcao = new Map<string, Airport>(
  db.airports.map((a) => [a.icao.toUpperCase(), a])
);
for (const [from, to] of Object.entries(db.aliases || {})) {
  const target = byIcao.get(to.toUpperCase());
  if (target) byIcao.set(from.toUpperCase(), target);
}

export function getAirportDbMeta() {
  return db.meta;
}

export function getAllAirports(): Airport[] {
  return db.airports;
}

export function lookupIcao(icao: string): Airport | undefined {
  return byIcao.get(icao.toUpperCase());
}

/** Resolve IATA (3) or ICAO (4) to airport record. US 3-letter without K also tried. */
export function resolveCode(input: string): Airport | null {
  const raw = input.trim().toUpperCase();
  if (!raw) return null;

  const direct = byIcao.get(raw);
  if (direct) return direct;

  if (raw.length === 3) {
    const icao = db.iataToIcao[raw];
    if (icao) {
      const a = byIcao.get(icao);
      if (a) return a;
    }
    const k = `K${raw}`;
    const us = byIcao.get(k);
    if (us) return us;
    const c = `C${raw}`;
    const ca = byIcao.get(c);
    if (ca) return ca;
  }

  if (/^[A-Z0-9]{4}$/.test(raw)) {
    return {
      icao: raw,
      iata: null,
      name: raw,
      city: null,
      country: guessCountry(raw),
      lat: 0,
      lon: 0,
      elev_ft: null,
      type: "unknown",
    };
  }

  return null;
}

function guessCountry(icao: string): string {
  if (icao.startsWith("C")) return "CA";
  if (icao.startsWith("K")) return "US";
  if (icao.startsWith("P")) return "US";
  if (icao.startsWith("T")) return "TT";
  if (icao.startsWith("M")) return "MX";
  return "XX";
}

export function resolveLeg(
  departure: string,
  destination: string,
  alternates: string[]
): { airports: ResolvedAirport[]; errors: string[] } {
  const errors: string[] = [];
  const out: ResolvedAirport[] = [];

  const add = (code: string, role: AirportRole) => {
    const a = resolveCode(code);
    if (!a) {
      errors.push(`Could not resolve airport code: ${code}`);
      return;
    }
    out.push({ ...a, input: code.trim().toUpperCase(), role });
  };

  add(departure, "departure");
  add(destination, "destination");
  for (const alt of alternates) {
    if (alt && alt.trim()) add(alt, "alternate");
  }

  return { airports: out, errors };
}

/** Sort airports west→east by longitude (ascending = more west first). */
export function sortWestToEast<T extends { lon: number; icao: string }>(
  list: T[]
): T[] {
  return [...list].sort((a, b) => {
    if (a.lon !== b.lon) return a.lon - b.lon;
    return a.icao.localeCompare(b.icao);
  });
}
