import type { CloudLayer, FlightCategory, MetarData, TafPeriod } from "./types";

/**
 * FAA flight category criteria (ceiling AGL / visibility SM):
 * LIFR: ceiling < 500  OR vis < 1
 * IFR:  ceiling 500–999 OR vis 1–<3
 * MVFR: ceiling 1000–3000 OR vis 3–5
 * VFR:  ceiling > 3000 AND vis > 5
 */
export function categoryFromCeilingVis(
  ceilingFt: number | null,
  visSm: number | null
): FlightCategory {
  const c = ceilingFt;
  const v = visSm;

  const lifr = (c !== null && c < 500) || (v !== null && v < 1);
  if (lifr) return "LIFR";

  const ifr =
    (c !== null && c >= 500 && c < 1000) || (v !== null && v >= 1 && v < 3);
  if (ifr) return "IFR";

  const mvfr =
    (c !== null && c >= 1000 && c <= 3000) || (v !== null && v >= 3 && v <= 5);
  if (mvfr) return "MVFR";

  if (c === null && v === null) return "UNK";

  // VFR when ceiling > 3000 (or missing) AND vis > 5 (or missing with other known)
  const vfrCeil = c === null || c > 3000;
  const vfrVis = v === null || v > 5;
  if (vfrCeil && vfrVis) return "VFR";

  return "UNK";
}

export function ceilingFromClouds(clouds?: CloudLayer[] | null): number | null {
  if (!clouds || !clouds.length) return null;
  const significant = new Set(["BKN", "OVC", "VV"]);
  let best: number | null = null;
  for (const layer of clouds) {
    const cover = (layer.cover || "").toUpperCase();
    if (!significant.has(cover)) continue;
    if (layer.base == null) continue;
    if (best === null || layer.base < best) best = layer.base;
  }
  return best;
}

export function parseVisibilitySm(visib: number | string | undefined | null): number | null {
  if (visib == null) return null;
  if (typeof visib === "number") return visib;
  const s = String(visib).trim();
  if (!s) return null;
  if (s === "10+" || s === "6+" || s === "P6SM" || s.startsWith("P")) {
    // P6SM means greater than 6 — treat as 6+ for category (VFR threshold is >5)
    if (s.includes("6")) return 6.1;
    if (s.includes("10")) return 10;
    return 10;
  }
  // Fractions like 1/2 or 1 1/2
  const frac = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (frac) {
    return parseInt(frac[1], 10) + parseInt(frac[2], 10) / parseInt(frac[3], 10);
  }
  const simple = s.match(/^(\d+)\/(\d+)$/);
  if (simple) {
    return parseInt(simple[1], 10) / parseInt(simple[2], 10);
  }
  const n = parseFloat(s.replace(/SM$/i, ""));
  return Number.isFinite(n) ? n : null;
}

/** Lightweight parse of visibility + cloud layers from a raw METAR/TAF fragment. */
export function parseRawObsFragment(raw: string | undefined | null): {
  visib: number | string | null;
  clouds: CloudLayer[];
} {
  if (!raw) return { visib: null, clouds: [] };
  const s = raw.replace(/\s+/g, " ").trim();
  let visib: number | string | null = null;
  const visMatch = s.match(/\b(P?\d+(?:\s+\d+\/\d+)?|\d+\/\d+)SM\b/i);
  if (visMatch) {
    visib = visMatch[1].toUpperCase().startsWith("P")
      ? visMatch[0].toUpperCase()
      : visMatch[1];
  } else if (/\bCAVOK\b/i.test(s)) {
    visib = 10;
  }
  const clouds: CloudLayer[] = [];
  const cloudRe = /\b(FEW|SCT|BKN|OVC|VV)(\d{3})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = cloudRe.exec(s)) !== null) {
    clouds.push({
      cover: m[1].toUpperCase() === "VV" ? "VV" : m[1].toUpperCase(),
      base: parseInt(m[2], 10) * 100,
    });
  }
  return { visib, clouds };
}

export function categoryFromMetar(metar: MetarData | null): FlightCategory {
  if (!metar) return "UNK";
  const provided = (metar.fltCat || "").toUpperCase();
  if (provided === "VFR" || provided === "MVFR" || provided === "IFR" || provided === "LIFR") {
    return provided as FlightCategory;
  }
  let ceiling = ceilingFromClouds(metar.clouds);
  let vis = parseVisibilitySm(metar.visib);
  if ((ceiling == null && vis == null) || (!metar.clouds?.length && metar.visib == null)) {
    const parsed = parseRawObsFragment(metar.rawOb);
    if (ceiling == null) ceiling = ceilingFromClouds(parsed.clouds);
    if (vis == null) vis = parseVisibilitySm(parsed.visib);
  }
  return categoryFromCeilingVis(ceiling, vis);
}

export function categoryFromTafPeriod(period: TafPeriod | null): FlightCategory {
  if (!period) return "UNK";
  const ceiling = ceilingFromClouds(period.clouds);
  const vis = parseVisibilitySm(period.visib);
  return categoryFromCeilingVis(ceiling, vis);
}

export const FAA_COLORS: Record<FlightCategory, { bg: string; fg: string; label: string }> = {
  VFR: { bg: "#008000", fg: "#ffffff", label: "VFR" },
  MVFR: { bg: "#FFFF00", fg: "#111111", label: "MVFR" },
  IFR: { bg: "#FF0000", fg: "#ffffff", label: "IFR" },
  LIFR: { bg: "#FF00FF", fg: "#ffffff", label: "LIFR" },
  UNK: { bg: "#4B5563", fg: "#ffffff", label: "UNK" },
};
