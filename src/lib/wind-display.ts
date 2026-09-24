/**
 * Wind / gust colour bands for METAR & TAF raw display.
 * Thresholds are knots (MPS converted). Use max(sustained, gust).
 * 15–25 yellow · 26–37 amber · >37 red.
 */

export type WindBand = "yellow" | "amber" | "red";

export const WIND_BAND_COLORS: Record<WindBand, string> = {
  yellow: "#eab308",
  amber: "#f59e0b",
  red: "#ef4444",
};

/** Whole wind group: 34018G30KT, VRB05KT, 18015MPS, 34018G30 */
export const WIND_GROUP_RE =
  /\b((?:VRB|[0-9]{3})[0-9]{2,3}(?:G[0-9]{2,3})?(?:KT|MPS|KMH)?)\b/gi;

export function windBandFromKt(kt: number): WindBand | null {
  if (!Number.isFinite(kt) || kt < 15) return null;
  if (kt > 37) return "red";
  if (kt >= 26) return "amber";
  return "yellow";
}

export function windBandFromSpeeds(
  wspdKt?: number | null,
  wgstKt?: number | null
): WindBand | null {
  const v = Math.max(wspdKt ?? 0, wgstKt ?? 0);
  return windBandFromKt(v);
}

export function windColor(band: WindBand | null | undefined): string | undefined {
  if (!band) return undefined;
  return WIND_BAND_COLORS[band];
}

function toKt(speed: number, unit: string | undefined): number {
  const u = (unit || "KT").toUpperCase();
  if (u === "MPS") return speed * 1.94384;
  if (u === "KMH" || u === "KPH") return speed * 0.539957;
  return speed;
}

/** Parse a single wind group token → speeds in knots. */
export function parseWindGroup(
  token: string
): { wspdKt: number; wgstKt: number | null; band: WindBand | null } | null {
  const m = token
    .trim()
    .match(/^(?:VRB|[0-9]{3})([0-9]{2,3})(?:G([0-9]{2,3}))?(KT|MPS|KMH)?$/i);
  if (!m) return null;
  const unit = m[3];
  const wspdKt = toKt(Number(m[1]), unit);
  const wgstKt = m[2] != null ? toKt(Number(m[2]), unit) : null;
  return {
    wspdKt,
    wgstKt,
    band: windBandFromSpeeds(wspdKt, wgstKt),
  };
}

export function isWindGroupToken(token: string): boolean {
  return parseWindGroup(token) != null;
}

export type MetarDisplayToken = {
  text: string;
  kind: "wind" | "text" | "space";
  windBand?: WindBand | null;
};

/** Tokenize a METAR raw string, colouring wind groups by band. */
export function tokenizeMetarForDisplay(rawOb: string): MetarDisplayToken[] {
  if (!rawOb) return [];
  const parts = rawOb.split(/(\s+)/);
  const out: MetarDisplayToken[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (/^\s+$/.test(p)) {
      out.push({ text: p, kind: "space" });
      continue;
    }
    const parsed = parseWindGroup(p);
    if (parsed) {
      out.push({ text: p, kind: "wind", windBand: parsed.band });
    } else {
      out.push({ text: p, kind: "text" });
    }
  }
  return out;
}
