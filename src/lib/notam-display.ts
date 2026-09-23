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

/**
 * Canadian RSC form: `RSC 02 6/6/6 DRY…`
 * Runway designator (02, 20, 12L, 12/30) is NOT a condition code.
 * Condition thirds a/b/c are 1–6.
 * Fallbacks: `RSC 5/3/1`, `RSC 6`, `RSC6`.
 */
const RSC_WITH_RWY_RE =
  /\bRSC\s+(\d{2}[LCR]?(?:\s*\/\s*\d{2}[LCR]?)?)\s+(\d)\s*\/\s*(\d)\s*\/\s*(\d)\b/gi;
const RSC_TRIPLET_RE = /\bRSC\s*(\d)\s*\/\s*(\d)\s*\/\s*(\d)\b/gi;
const RSC_SINGLE_RE = /\bRSC\s*(\d)\b(?!\s*\/)/gi;

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

function tripletPartsFromAfter(after: string, a: string, b: string, c: string): SubPart[] {
  const tm = after.match(/^(\s*)(\d)(\s*\/\s*)(\d)(\s*\/\s*)(\d)\s*$/);
  if (tm) {
    return [
      { text: tm[1], kind: "text" },
      { text: tm[2], kind: "rsc", rscLevel: Number(tm[2]) },
      { text: tm[3], kind: "text" },
      { text: tm[4], kind: "rsc", rscLevel: Number(tm[4]) },
      { text: tm[5], kind: "text" },
      { text: tm[6], kind: "rsc", rscLevel: Number(tm[6]) },
    ];
  }
  return [
    { text: a, kind: "rsc", rscLevel: Number(a) },
    { text: "/", kind: "text" },
    { text: b, kind: "rsc", rscLevel: Number(b) },
    { text: "/", kind: "text" },
    { text: c, kind: "rsc", rscLevel: Number(c) },
  ];
}

function collectRscSpans(text: string): Span[] {
  const spans: Span[] = [];
  const covered: Array<{ start: number; end: number }> = [];
  const overlaps = (s: number, e: number) =>
    covered.some((c) => s < c.end && e > c.start);

  // 1) RSC <rwy> a/b/c — e.g. RSC 02 6/6/6
  {
    const re = new RegExp(RSC_WITH_RWY_RE.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const rwy = m[1];
      const rwyAt = m[0].toUpperCase().indexOf(rwy.toUpperCase());
      const prefixLen = rwyAt + rwy.length;
      const prefix = m[0].slice(0, prefixLen);
      const after = m[0].slice(prefixLen);
      const a = Number(m[2]);
      const b = Number(m[3]);
      const c = Number(m[4]);
      // Lower RSC = worse; paint "RSC 02" with the worst third so the whole phrase reads as one colour band when uniform.
      const worst = Math.min(a, b, c);
      spans.push({
        start,
        end,
        kind: "rsc",
        parts: [
          { text: prefix, kind: "rsc", rscLevel: worst },
          ...tripletPartsFromAfter(after, m[2], m[3], m[4]),
        ],
      });
      covered.push({ start, end });
    }
  }

  // 2) RSC a/b/c (no runway)
  {
    const re = new RegExp(RSC_TRIPLET_RE.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const labelMatch = m[0].match(/^RSC\s*/i);
      const label = labelMatch ? labelMatch[0] : "RSC";
      const after = m[0].slice(label.length);
      const tm = after.match(/^(\d)(\s*\/\s*)(\d)(\s*\/\s*)(\d)\s*$/);
      const a = Number(m[1]);
      const b = Number(m[2]);
      const c = Number(m[3]);
      const worst = Math.min(a, b, c);
      const parts: SubPart[] = [{ text: label, kind: "rsc", rscLevel: worst }];
      if (tm) {
        parts.push({ text: tm[1], kind: "rsc", rscLevel: Number(tm[1]) });
        parts.push({ text: tm[2], kind: "text" });
        parts.push({ text: tm[3], kind: "rsc", rscLevel: Number(tm[3]) });
        parts.push({ text: tm[4], kind: "text" });
        parts.push({ text: tm[5], kind: "rsc", rscLevel: Number(tm[5]) });
      }
      spans.push({ start, end, kind: "rsc", parts });
      covered.push({ start, end });
    }
  }

  // 3) RSC 6 / RSC6 single condition (not a runway designator)
  {
    const re = new RegExp(RSC_SINGLE_RE.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const labelMatch = m[0].match(/^RSC\s*/i);
      const label = labelMatch ? labelMatch[0] : "RSC";
      const digit = m[1];
      spans.push({
        start,
        end,
        kind: "rsc",
        parts: [
          { text: label, kind: "rsc", rscLevel: Number(digit) },
          { text: digit, kind: "rsc", rscLevel: Number(digit) },
        ],
      });
      covered.push({ start, end });
    }
  }

  return spans.sort((a, b) => a.start - b.start);
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
          bold: overlapsWindow || p.kind === "hazard" || p.kind === "rsc",
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
