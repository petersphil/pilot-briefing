/**
 * Parse ICAO raw TAF text into structured TafPeriod[] (and clause spans for UI).
 * Used when AWC structured `fcsts` are missing (e.g. NOAA tgftp on Android).
 */

import type { CloudLayer, FlightCategory, TafData, TafPeriod } from "./types";
import {
  categoryFromCeilingVis,
  ceilingFromClouds,
  parseVisibilitySm,
} from "./flightCategory";

export interface TafClause {
  /** Slice of the normalized raw TAF for this group */
  text: string;
  /** Start index in normalized raw */
  start: number;
  /** End index (exclusive) in normalized raw */
  end: number;
  period: TafPeriod;
  /** BASE | FM | BECMG | TEMPO | PROB */
  kind: string;
}

export interface ParsedTaf {
  icaoId?: string;
  issueTime?: string;
  validTimeFrom?: number;
  validTimeTo?: number;
  fcsts: TafPeriod[];
  clauses: TafClause[];
  /** Normalized single-line raw used for indexing */
  normalized: string;
}

const CHANGE_RE =
  /\b(FM\d{4,6}|BECMG(?:\s+\d{4}\/\d{4})?|TEMPO(?:\s+\d{4}\/\d{4})?|PROB[34]0(?:\s+TEMPO)?(?:\s+\d{4}\/\d{4})?)\b/gi;

const WIND_RE =
  /^(?:VRB|\d{3})(\d{2,3})(G\d{2,3})?(KT|MPS)$/i;
const VIS_SM_RE =
  /^(P?\d+(?:\s+\d+\/\d+)?|\d+\/\d+)SM$/i;
const VIS_M_RE = /^\d{4}$/;
const CLOUD_RE = /^(FEW|SCT|BKN|OVC|VV)(\d{3})(CB|TCU)?$/i;
const SKC_NSC = /^(SKC|CLR|NSC|NCD|CAVOK)$/i;
const WX_RE =
  /^(?:\+|-|VC)?(?:MI|PR|BC|DR|BL|SH|TS|FZ)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+$/i;

function refFromIssue(issueTime?: string | null): Date {
  if (issueTime) {
    const d = new Date(issueTime);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * Resolve DD + HH[:MM] against a reference (issue) instant.
 * Day < issue day ⇒ next month. Hour 24 ⇒ next day 00:00.
 */
function resolveDdHh(
  day: number,
  hour: number,
  minute: number,
  ref: Date
): number {
  let h = hour;
  let addDay = 0;
  if (h === 24) {
    h = 0;
    addDay = 1;
  }
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const issueDay = ref.getUTCDate();

  let year = y;
  let month = m;
  if (day < issueDay - 1) {
    // Rolled into next month (allow day == issueDay-1 for late-month edge via valid span)
    // Prefer: if day is clearly earlier in calendar than issue day, next month
  }
  if (day < issueDay) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  const t = Date.UTC(year, month, day, h, minute, 0) + addDay * 86400_000;
  return Math.floor(t / 1000);
}

function parseValidity(
  token: string,
  ref: Date
): { from: number; to: number } | null {
  // DDHH/DDHH or DDHHDDHH
  let m = token.match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
  if (m) {
    return {
      from: resolveDdHh(+m[1], +m[2], 0, ref),
      to: resolveDdHh(+m[3], +m[4], 0, ref),
    };
  }
  m = token.match(/^(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    return {
      from: resolveDdHh(+m[1], +m[2], 0, ref),
      to: resolveDdHh(+m[3], +m[4], 0, ref),
    };
  }
  return null;
}

function parseFmTime(token: string, ref: Date): number | null {
  // FMHHMM (legacy) or FMDDHHMM
  const m = token.match(/^FM(\d{2})(\d{2})(\d{2})?$/i);
  if (!m) return null;
  if (m[3] != null) {
    // FMDDHHMM
    return resolveDdHh(+m[1], +m[2], +m[3], ref);
  }
  // FMHHMM — day from ref (or validity start day); use ref day
  return resolveDdHh(ref.getUTCDate(), +m[1], +m[2], ref);
}

function parseRange(
  a: string,
  b: string,
  ref: Date
): { from: number; to: number } | null {
  const left = a.match(/^(\d{2})(\d{2})$/);
  const right = b.match(/^(\d{2})(\d{2})$/);
  if (!left || !right) return null;
  return {
    from: resolveDdHh(+left[1], +left[2], 0, ref),
    to: resolveDdHh(+right[1], +right[2], 0, ref),
  };
}

function metersToSm(m: number): number {
  // 9999 → 6+ SM; rough conversion 1609 m/SM
  if (m >= 9999) return 6.1;
  return Math.round((m / 1609) * 10) / 10;
}

function parseBodyTokens(tokens: string[]): Partial<TafPeriod> {
  const out: Partial<TafPeriod> = { clouds: [] };
  const wxParts: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t || t === "=") continue;

    // Wind
    if (WIND_RE.test(t)) {
      const wm = t.match(/^(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/i);
      if (wm) {
        out.wdir = wm[1].toUpperCase() === "VRB" ? "VRB" : parseInt(wm[1], 10);
        let spd = parseInt(wm[2], 10);
        let gst = wm[3] ? parseInt(wm[3], 10) : null;
        if (wm[4].toUpperCase() === "MPS") {
          spd = Math.round(spd * 1.94384);
          if (gst != null) gst = Math.round(gst * 1.94384);
        }
        out.wspd = spd;
        out.wgst = gst;
      }
      continue;
    }

    // Visibility SM (may be "1" + "1/2SM" split — handle joined forms first)
    if (VIS_SM_RE.test(t)) {
      out.visib = t.toUpperCase().replace(/\s+/g, " ");
      continue;
    }
    // Split fraction: "1" "1/2SM"
    if (
      /^\d+$/.test(t) &&
      i + 1 < tokens.length &&
      /^\d+\/\d+SM$/i.test(tokens[i + 1])
    ) {
      out.visib = `${t} ${tokens[i + 1]}`.toUpperCase();
      i++;
      continue;
    }
    // Meters
    if (VIS_M_RE.test(t) && !CLOUD_RE.test(t)) {
      const meters = parseInt(t, 10);
      // Avoid treating cloud-less 4-digit as wind already handled; 0000–9999 vis
      if (meters <= 9999) {
        out.visib = metersToSm(meters);
        continue;
      }
    }

    if (SKC_NSC.test(t)) {
      if (t.toUpperCase() === "CAVOK") {
        out.visib = 10;
        out.clouds = [];
      }
      continue;
    }

    if (CLOUD_RE.test(t)) {
      const cm = t.match(CLOUD_RE)!;
      const cover = cm[1].toUpperCase();
      const base = parseInt(cm[2], 10) * 100;
      if (cover === "VV") {
        out.vertVis = base;
        (out.clouds as CloudLayer[]).push({ cover: "VV", base });
      } else {
        (out.clouds as CloudLayer[]).push({ cover, base });
      }
      continue;
    }

    // NSW / weather
    if (t.toUpperCase() === "NSW") {
      wxParts.push("NSW");
      continue;
    }
    if (WX_RE.test(t) || /^(RE|VC)/i.test(t)) {
      wxParts.push(t.toUpperCase());
      continue;
    }

    // Ignore: QNH, TX/TN, WS, etc.
  }

  if (wxParts.length) out.wxString = wxParts.join(" ");
  if (out.clouds && !(out.clouds as CloudLayer[]).length) delete out.clouds;
  return out;
}

interface RawGroup {
  kind: string;
  header: string;
  body: string;
  start: number;
  end: number;
  probability?: number;
  timeFrom?: number;
  timeTo?: number;
  timeBec?: number;
}

function normalizeRaw(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\n\s+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Parse raw TAF into periods + clause spans.
 */
export function parseRawTaf(
  rawTAF: string,
  issueTimeHint?: string | null
): ParsedTaf {
  const normalized = normalizeRaw(rawTAF);
  const empty: ParsedTaf = {
    fcsts: [],
    clauses: [],
    normalized,
    issueTime: issueTimeHint || undefined,
  };
  if (!normalized) return empty;

  // Header: optional TAF AMD/COR, ICAO, issue Z, validity
  const headerRe =
    /^(?:TAF\s+)?(?:(AMD|COR)\s+)?([A-Z]{4})\s+(\d{6}Z)\s+(\d{4}\/\d{4}|\d{8})\b/i;
  const hm = normalized.match(headerRe);

  let icaoId: string | undefined;
  let issueZ: string | undefined;
  let validityTok: string | undefined;
  let bodyStart = 0;

  if (hm) {
    icaoId = hm[2].toUpperCase();
    issueZ = hm[3].toUpperCase();
    validityTok = hm[4];
    bodyStart = (hm.index ?? 0) + hm[0].length;
  } else {
    // Try without TAF keyword variants already covered; looser: ICAO + Z + valid
    const loose = normalized.match(
      /\b([A-Z]{4})\s+(\d{6}Z)\s+(\d{4}\/\d{4}|\d{8})\b/i
    );
    if (loose) {
      icaoId = loose[1].toUpperCase();
      issueZ = loose[2].toUpperCase();
      validityTok = loose[3];
      bodyStart = (loose.index ?? 0) + loose[0].length;
    }
  }

  // Build reference date from issueTimeHint or issue Z group
  let ref = refFromIssue(issueTimeHint);
  if (issueZ) {
    const im = issueZ.match(/^(\d{2})(\d{2})(\d{2})Z$/i);
    if (im) {
      const day = +im[1];
      const hour = +im[2];
      const minute = +im[3];
      // Anchor month/year from hint or "now", then set day/hour
      const sec = resolveDdHh(day, hour, minute, ref);
      ref = new Date(sec * 1000);
    }
  }

  let validTimeFrom: number | undefined;
  let validTimeTo: number | undefined;
  if (validityTok) {
    const v = parseValidity(validityTok, ref);
    if (v) {
      validTimeFrom = v.from;
      validTimeTo = v.to;
      // Prefer validity start as ref for subsequent DD resolution within the bulletin
      ref = new Date(v.from * 1000);
    }
  }

  const body = normalized.slice(bodyStart).trim();
  // Precise: find body start in normalized
  const preciseBodyStart = body ? normalized.indexOf(body) : bodyStart;
  const fullBodyStart = preciseBodyStart >= 0 ? preciseBodyStart : bodyStart;

  // Split body into groups at change indicators
  const groups: RawGroup[] = [];
  const changeMatches: { index: number; text: string }[] = [];
  CHANGE_RE.lastIndex = 0;
  let cm: RegExpExecArray | null;
  const changeSrc = body;
  while ((cm = CHANGE_RE.exec(changeSrc)) !== null) {
    changeMatches.push({ index: cm.index, text: cm[0] });
  }

  if (!changeMatches.length) {
    groups.push({
      kind: "BASE",
      header: "",
      body: body,
      start: fullBodyStart,
      end: fullBodyStart + body.length,
    });
  } else {
    // Base = before first change
    const first = changeMatches[0];
    if (first.index > 0) {
      const baseText = body.slice(0, first.index).trim();
      if (baseText) {
        const absStart = fullBodyStart + body.indexOf(baseText);
        groups.push({
          kind: "BASE",
          header: "",
          body: baseText,
          start: absStart,
          end: absStart + baseText.length,
        });
      }
    }
    for (let i = 0; i < changeMatches.length; i++) {
      const cur = changeMatches[i];
      const nextIdx =
        i + 1 < changeMatches.length ? changeMatches[i + 1].index : body.length;
      const chunk = body.slice(cur.index, nextIdx).trim();
      const absStart = fullBodyStart + cur.index;
      // Parse header token(s) from chunk
      const parts = chunk.split(/\s+/);
      let kind = "FM";
      let probability: number | undefined;
      let headerConsumed = 1;
      const head = parts[0].toUpperCase();

      if (head.startsWith("FM")) {
        kind = "FM";
        headerConsumed = 1;
      } else if (head === "BECMG") {
        kind = "BECMG";
        headerConsumed = 1;
        if (parts[1] && /^\d{4}\/\d{4}$/.test(parts[1])) headerConsumed = 2;
      } else if (head === "TEMPO") {
        kind = "TEMPO";
        headerConsumed = 1;
        if (parts[1] && /^\d{4}\/\d{4}$/.test(parts[1])) headerConsumed = 2;
      } else if (head.startsWith("PROB")) {
        kind = "PROB";
        probability = parseInt(head.slice(4), 10) || undefined;
        headerConsumed = 1;
        if (parts[1]?.toUpperCase() === "TEMPO") {
          kind = "TEMPO";
          headerConsumed = 2;
          if (parts[2] && /^\d{4}\/\d{4}$/.test(parts[2])) headerConsumed = 3;
        } else if (parts[1] && /^\d{4}\/\d{4}$/.test(parts[1])) {
          headerConsumed = 2;
        }
      }

      const header = parts.slice(0, headerConsumed).join(" ");
      const rest = parts.slice(headerConsumed).join(" ");
      groups.push({
        kind,
        header,
        body: rest,
        start: absStart,
        end: absStart + chunk.length,
        probability,
      });
    }
  }

  // Assign times
  const validFrom = validTimeFrom ?? Math.floor(ref.getTime() / 1000);
  const validTo = validTimeTo ?? validFrom + 24 * 3600;

  // First pass: set explicit times from headers
  for (const g of groups) {
    if (g.kind === "BASE") {
      g.timeFrom = validFrom;
      g.timeTo = validTo;
      continue;
    }
    const hp = g.header.split(/\s+/);
    if (g.kind === "FM") {
      const t = parseFmTime(hp[0], ref);
      if (t != null) {
        g.timeFrom = t;
        g.timeTo = validTo; // until next FM / end
      }
    } else if (g.kind === "BECMG" || g.kind === "TEMPO" || g.kind === "PROB") {
      const rangeTok = hp.find((p) => /^\d{4}\/\d{4}$/.test(p));
      if (rangeTok) {
        const [a, b] = rangeTok.split("/");
        const r = parseRange(a, b, ref);
        if (r) {
          g.timeFrom = r.from;
          g.timeTo = r.to;
          if (g.kind === "BECMG") g.timeBec = r.to;
        }
      } else {
        g.timeFrom = validFrom;
        g.timeTo = validTo;
      }
    }
  }

  // FM chain: each FM ends at next FM start (or validTo)
  const fmIdx = groups
    .map((g, i) => (g.kind === "FM" ? i : -1))
    .filter((i) => i >= 0);
  for (let i = 0; i < fmIdx.length; i++) {
    const gi = fmIdx[i];
    const next = i + 1 < fmIdx.length ? groups[fmIdx[i + 1]] : null;
    if (groups[gi].timeFrom != null) {
      groups[gi].timeTo = next?.timeFrom ?? validTo;
    }
  }
  // BASE ends at first FM (if any)
  const firstFm = groups.find((g) => g.kind === "FM" && g.timeFrom != null);
  const base = groups.find((g) => g.kind === "BASE");
  if (base && firstFm?.timeFrom != null) {
    base.timeTo = firstFm.timeFrom;
  }

  // Inherit wind/vis/clouds from previous prevailing (BASE/FM/BECMG) for FM that omit fields
  let prevPrevailing: Partial<TafPeriod> = {};
  const clauses: TafClause[] = [];
  const fcsts: TafPeriod[] = [];

  for (const g of groups) {
    const tokens = g.body.split(/\s+/).filter(Boolean);
    const parsed = parseBodyTokens(tokens);
    const isPrevailing = g.kind === "BASE" || g.kind === "FM" || g.kind === "BECMG";

    const period: TafPeriod = {
      timeFrom: g.timeFrom ?? validFrom,
      timeTo: g.timeTo ?? validTo,
      timeBec: g.timeBec,
      fcstChange: g.kind === "BASE" ? null : g.kind,
      probability: g.probability ?? null,
      wdir: parsed.wdir ?? (isPrevailing ? undefined : prevPrevailing.wdir),
      wspd: parsed.wspd ?? (isPrevailing ? undefined : prevPrevailing.wspd),
      wgst:
        parsed.wgst !== undefined
          ? parsed.wgst
          : isPrevailing
            ? parsed.wgst ?? null
            : (prevPrevailing.wgst as number | null | undefined) ?? null,
      visib: parsed.visib ?? (isPrevailing ? undefined : prevPrevailing.visib),
      wxString: parsed.wxString ?? null,
      clouds:
        parsed.clouds ??
        (isPrevailing ? undefined : (prevPrevailing.clouds as CloudLayer[] | undefined)),
      vertVis:
        parsed.vertVis !== undefined
          ? parsed.vertVis
          : isPrevailing
            ? null
            : (prevPrevailing.vertVis as number | null | undefined) ?? null,
    };

    // For prevailing groups, fill from previous if omitted (FM often carries forward)
    if (isPrevailing) {
      if (period.wdir == null && prevPrevailing.wdir != null) period.wdir = prevPrevailing.wdir;
      if (period.wspd == null && prevPrevailing.wspd != null) period.wspd = prevPrevailing.wspd;
      if (period.wgst == null && prevPrevailing.wgst != null) period.wgst = prevPrevailing.wgst as number;
      if (period.visib == null && prevPrevailing.visib != null) period.visib = prevPrevailing.visib;
      if (!period.clouds?.length && prevPrevailing.clouds) {
        period.clouds = prevPrevailing.clouds as CloudLayer[];
      }
      prevPrevailing = { ...period };
    } else {
      // TEMPO/PROB: inherit missing from prevailing
      if (period.wdir == null) period.wdir = prevPrevailing.wdir;
      if (period.wspd == null) period.wspd = prevPrevailing.wspd;
      if (period.visib == null) period.visib = prevPrevailing.visib;
      if (!period.clouds?.length && prevPrevailing.clouds) {
        period.clouds = prevPrevailing.clouds as CloudLayer[];
      }
    }

    fcsts.push(period);
    const clauseText = normalized.slice(g.start, g.end);
    clauses.push({
      text: clauseText || g.header + (g.body ? " " + g.body : ""),
      start: g.start,
      end: g.end,
      period,
      kind: g.kind,
    });
  }

  return {
    icaoId,
    issueTime: issueTimeHint || (issueZ ? undefined : undefined),
    validTimeFrom,
    validTimeTo,
    fcsts,
    clauses,
    normalized,
  };
}

/** Attach parsed fcsts when missing. Returns same object reference if already filled. */
export function ensureTafFcsts(taf: TafData | null): TafData | null {
  if (!taf) return null;
  if (taf.fcsts && taf.fcsts.length > 0) return taf;
  if (!taf.rawTAF) return taf;
  const parsed = parseRawTaf(taf.rawTAF, taf.issueTime);
  if (!parsed.fcsts.length) return taf;
  return {
    ...taf,
    fcsts: parsed.fcsts,
    validTimeFrom: taf.validTimeFrom ?? parsed.validTimeFrom,
    validTimeTo: taf.validTimeTo ?? parsed.validTimeTo,
  };
}

export function flightWindowUnix(
  departureUtc: Date,
  enrouteMinutes: number
): { from: number; to: number } {
  const from = Math.floor(departureUtc.getTime() / 1000);
  const to = from + (enrouteMinutes + 120) * 60;
  return { from, to };
}

export function periodOverlapsWindow(
  period: TafPeriod,
  win: { from: number; to: number }
): boolean {
  return period.timeFrom < win.to && period.timeTo > win.from;
}

/** Token kinds for rich TAF display */
export type TafTokenKind = "vis" | "ceiling" | "text" | "space";

export interface TafDisplayToken {
  text: string;
  kind: TafTokenKind;
  /** FAA category colour when kind is vis/ceiling and clause in window */
  category?: FlightCategory;
  bold: boolean;
}

const VIS_TOKEN_RE =
  /^(P?\d+(?:\s+\d+\/\d+)?|\d+\/\d+)SM$/i;
const CEILING_TOKEN_RE = /^(BKN|OVC|VV)(\d{3})(CB|TCU)?$/i;

/**
 * Build display tokens for a raw TAF: bold clauses overlapping the flight window;
 * colour vis + BKN/OVC/VV tokens in those clauses by period category.
 */
export function tokenizeTafForDisplay(
  rawTAF: string,
  issueTime: string | undefined,
  departureUtc: Date,
  enrouteMinutes: number,
  existingFcsts?: TafPeriod[] | null
): TafDisplayToken[] {
  const parsed = parseRawTaf(rawTAF, issueTime);
  const win = flightWindowUnix(departureUtc, enrouteMinutes);
  // Prefer freshly parsed clauses for spans; periods may come from existing fcsts
  const clauses =
    parsed.clauses.length > 0
      ? parsed.clauses
      : [];

  if (!clauses.length) {
    return [{ text: normalizeRaw(rawTAF), kind: "text", bold: false }];
  }

  const tokens: TafDisplayToken[] = [];
  let cursor = 0;
  const norm = parsed.normalized;

  // Header before first clause
  const firstStart = Math.min(...clauses.map((c) => c.start));
  if (firstStart > 0) {
    const header = norm.slice(0, firstStart);
    // Bold header if any clause in window (whole bulletin context) — keep normal weight
    pushPlain(tokens, header, false);
    cursor = firstStart;
  }

  for (const clause of clauses) {
    if (clause.start > cursor) {
      pushPlain(tokens, norm.slice(cursor, clause.start), false);
    }
    const inWindow = periodOverlapsWindow(clause.period, win);
    const cat = categoryFromPeriod(clause.period);
    tokenizeClause(tokens, clause.text, inWindow, cat);
    cursor = clause.end;
  }
  if (cursor < norm.length) {
    pushPlain(tokens, norm.slice(cursor), false);
  }

  // Silence unused when existingFcsts provided for future merge
  void existingFcsts;
  return tokens;
}

function categoryFromPeriod(period: TafPeriod): FlightCategory {
  const ceiling =
    period.vertVis != null
      ? period.vertVis
      : ceilingFromClouds(period.clouds);
  const vis = parseVisibilitySm(period.visib);
  return categoryFromCeilingVis(ceiling, vis);
}

function pushPlain(tokens: TafDisplayToken[], text: string, bold: boolean) {
  if (!text) return;
  tokens.push({ text, kind: "text", bold });
}

function tokenizeClause(
  tokens: TafDisplayToken[],
  text: string,
  bold: boolean,
  cat: FlightCategory
) {
  // Split preserving spaces
  const parts = text.split(/(\s+)/);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    if (/^\s+$/.test(p)) {
      tokens.push({ text: p, kind: "space", bold });
      continue;
    }
    // Joined vis fraction across tokens already in one part if normalized
    // Handle "1" + "1/2SM"
    if (
      /^\d+$/.test(p) &&
      i + 2 < parts.length &&
      /^\s+$/.test(parts[i + 1]) &&
      /^\d+\/\d+SM$/i.test(parts[i + 2])
    ) {
      const combined = `${p}${parts[i + 1]}${parts[i + 2]}`;
      tokens.push({
        text: combined,
        kind: "vis",
        category: bold ? cat : undefined,
        bold,
      });
      i += 2;
      continue;
    }
    if (VIS_TOKEN_RE.test(p) || /^CAVOK$/i.test(p)) {
      tokens.push({
        text: p,
        kind: "vis",
        category: bold ? cat : undefined,
        bold,
      });
      continue;
    }
    if (/^\d{4}$/.test(p) && +p <= 9999) {
      // meter visibility — colour when in window
      tokens.push({
        text: p,
        kind: "vis",
        category: bold ? cat : undefined,
        bold,
      });
      continue;
    }
    if (CEILING_TOKEN_RE.test(p)) {
      tokens.push({
        text: p,
        kind: "ceiling",
        category: bold ? cat : undefined,
        bold,
      });
      continue;
    }
    tokens.push({ text: p, kind: "text", bold });
  }
}

export { categoryFromPeriod as categoryFromParsedPeriod };
