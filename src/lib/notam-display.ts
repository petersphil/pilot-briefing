/**
 * NOTAM display tokenization: flight-window bold + hazard/RSC spans.
 * Flight window matches TAF: [dep, dep + enroute + 2h].
 */

export type NotamTokenKind = "text" | "hazard" | "rsc";

export interface NotamDisplayToken {
  text: string;
  kind: NotamTokenKind;
  /** Whole NOTAM overlaps flight window (plain text inherits). */
  bold: boolean;
  /** RSC numeric third for colouring (1–6 typical). */
  rscLevel?: number;
}

export function flightWindowMs(
  departureUtc: Date,
  enrouteMinutes: number
): { from: number; to: number } {
  const from = departureUtc.getTime();
  const to = from + (enrouteMinutes + 120) * 60 * 1000;
  return { from, to };
}

/** Missing start → already started; missing/invalid end → open-ended. */
export function notamOverlapsFlightWindow(
  notam: { start?: string | null; end?: string | null },
  departureUtc: Date,
  enrouteMinutes: number
): boolean {
  const win = flightWindowMs(departureUtc, enrouteMinutes);
  let start = Number.NEGATIVE_INFINITY;
  let end = Number.POSITIVE_INFINITY;
  if (notam.start) {
    const t = Date.parse(notam.start);
    if (Number.isFinite(t)) start = t;
  }
  if (notam.end) {
    const t = Date.parse(notam.end);
    if (Number.isFinite(t)) end = t;
  }
  return start < win.to && end > win.from;
}

/** RSC colour: 5–6 green, 3–4 yellow, 1–2 red. */
export function rscColor(level: number): string | undefined {
  if (level === 5 || level === 6) return "#22c55e";
  if (level === 3 || level === 4) return "#eab308";
  if (level === 1 || level === 2) return "#ef4444";
  return undefined;
}

/**
 * Hazard phrases: RWY…CLSD / RUNWAY…CLOSED / ILS…U/S / approach UNSERVICEABLE.
 * Captures Phil-style tokens like `RWY 17L/35R CLSD`.
 */
const HAZARD_RE =
  /\b(?:(?:RWY|RWYS|RUNWAYS?)\s+[\dA-Z]+(?:\s*\/\s*[\dA-Z]+)?\s+(?:CLSD|CLOSED)|(?:ILS|LOC|LDA|SDF)(?:\s+(?:RWY|RUNWAY)\s+[\dA-Z\/]+)?\s+(?:U\/S|UNSERVICEABLE)|(?:APPROACH|APCH|IAP|MISSED\s+APPROACH)\s+(?:U\/S|UNSERVICEABLE)|(?:U\/S|UNSERVICEABLE)\s+(?:APPROACH|APCH|IAP))\b/gi;

/** RSC 5, RSC5, RSC 05/05/05, RSC 5/3/1 */
const RSC_RE = /\bRSC\s*\d{1,2}(?:\s*\/\s*\d{1,2}){0,2}\b/gi;

interface SubPart {
  text: string;
  kind: NotamTokenKind;
  rscLevel?: number;
}

interface Span {
  start: number;
  end: number;
  kind: NotamTokenKind;
  parts?: SubPart[];
}

function collectHazardSpans(text: string): Span[] {
  const spans: Span[] = [];
  const re = new RegExp(HAZARD_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length, kind: "hazard" });
  }
  return spans;
}

function splitRscMatch(full: string): SubPart[] {
  const parts: SubPart[] = [];
  const re = /(RSC\s*)|(\/)|(\d{1,2})|(\s+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(full)) !== null) {
    if (m[1]) {
      parts.push({ text: m[1], kind: "text" });
    } else if (m[2]) {
      parts.push({ text: m[2], kind: "text" });
    } else if (m[3]) {
      parts.push({ text: m[3], kind: "rsc", rscLevel: Number(m[3]) });
    } else if (m[4]) {
      parts.push({ text: m[4], kind: "text" });
    }
  }
  if (!parts.length) parts.push({ text: full, kind: "text" });
  return parts;
}

function collectRscSpans(text: string): Span[] {
  const spans: Span[] = [];
  const re = new RegExp(RSC_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    spans.push({
      start: m.index,
      end: m.index + m[0].length,
      kind: "rsc",
      parts: splitRscMatch(m[0]),
    });
  }
  return spans;
}

function mergeSpans(hazard: Span[], rsc: Span[]): Span[] {
  const all = [...hazard, ...rsc].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Span[] = [];
  for (const s of all) {
    const last = out[out.length - 1];
    if (last && s.start < last.end) {
      if (last.kind === "hazard") continue;
      if (s.kind === "hazard") {
        out.pop();
        out.push(s);
      }
      continue;
    }
    out.push(s);
  }
  return out;
}

export function tokenizeNotamForDisplay(
  text: string,
  overlapsWindow: boolean
): NotamDisplayToken[] {
  if (!text) return [];
  const spans = mergeSpans(collectHazardSpans(text), collectRscSpans(text));
  const tokens: NotamDisplayToken[] = [];
  let i = 0;
  for (const span of spans) {
    if (span.start > i) {
      tokens.push({
        text: text.slice(i, span.start),
        kind: "text",
        bold: overlapsWindow,
      });
    }
    if (span.parts?.length) {
      for (const p of span.parts) {
        tokens.push({
          text: p.text,
          kind: p.kind,
          bold:
            overlapsWindow ||
            p.kind === "hazard" ||
            p.kind === "rsc",
          rscLevel: p.rscLevel,
        });
      }
    } else if (span.kind === "hazard") {
      tokens.push({
        text: text.slice(span.start, span.end),
        kind: "hazard",
        bold: true,
      });
    } else {
      tokens.push({
        text: text.slice(span.start, span.end),
        kind: span.kind,
        bold: overlapsWindow,
      });
    }
    i = span.end;
  }
  if (i < text.length) {
    tokens.push({ text: text.slice(i), kind: "text", bold: overlapsWindow });
  }
  return tokens;
}
