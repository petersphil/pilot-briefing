/**
 * Learn-preference rules for the NOTAM list.
 *
 * Identity: a stable NOTAM id when the feed gave one (Nav Canada pk, SkyLink
 * notam id, sample id). Index fallbacks like "CYYZ-3" are not stable, so those
 * votes key off airport + normalized text.
 *
 * Location (airport-scoped facility), first designator in the text:
 *   CYYZ|RWY|05/23   runway pair stored with the lower heading first (34/16 ≡ 16/34)
 *   CYYZ|TWY|A
 *   CYYZ|APRON|I
 * No runway/taxiway/apron designator → no location key (an N/A does not hide
 * every other NOTAM at the airport).
 *
 * Type (global, not a new heading): `${group}|${condition}` where group is the
 * existing classifier (runway, taxiway, …) and condition is RSC, CLSD,
 * SHORTENED, U/S, NOT_AVBL, WIP, RESTRICT, or INFO. Up/down/N/A teach later
 * NOTAMs that share this type OR this location. Matching is OR.
 *
 * Down never hides. Only a direct N/A, or a learned N/A on location or type,
 * hides. An explicit Unmark ("shown") or a direct up/down keeps that NOTAM
 * visible even if a learned N/A would otherwise hide it. A later up/down vote
 * replaces the location and type rule (so it can clear a learned N/A).
 */

import type { NotamGroup, NotamItem } from "./types";
import { AVIATION_TERMS } from "./notam-terms";

export const LEARN_PREFS_STORAGE_KEY = "pilotBriefing.learnPrefs";

export type LearnVote = "up" | "down" | "na";
export type ItemMark = LearnVote | "shown";

export interface LearnPrefs {
  learnOn: boolean;
  /** Keyed by notamIdentity. "shown" is an explicit unmark. */
  items: Record<string, ItemMark>;
  /** Keyed by notamLocationKey. */
  locations: Record<string, LearnVote>;
  /** Keyed by notamTypeKey. */
  types: Record<string, LearnVote>;
}

export interface LearnNotam {
  id: string;
  icao: string;
  text: string;
  group: NotamGroup;
}

const SYNTHETIC_ID = /^[A-Z0-9]{3,4}-\d+$/i;
const VOTES = new Set<LearnVote>(["up", "down", "na"]);
const ITEM_MARKS = new Set<ItemMark>(["up", "down", "na", "shown"]);

export function emptyLearnPrefs(): LearnPrefs {
  return { learnOn: false, items: {}, locations: {}, types: {} };
}

/** Stable identity. Synthetic `${ICAO}-${index}` ids follow the text instead. */
export function notamIdentity(n: Pick<LearnNotam, "id" | "icao" | "text">): string {
  const id = (n.id || "").trim();
  if (id && !SYNTHETIC_ID.test(id)) return `id:${id}`;
  const text = (n.text || "").toUpperCase().replace(/\s+/g, " ").trim();
  return `txt:${(n.icao || "").toUpperCase()}:${text}`;
}

function canonicalRunway(raw: string): string {
  const parts = raw
    .toUpperCase()
    .split("/")
    .map((s) => s.replace(/\s+/g, ""))
    .filter(Boolean);
  const norm = parts.map((p) => {
    const m = p.match(/^0*(\d{1,2})([LCR]?)$/);
    if (!m) return p;
    return m[1].padStart(2, "0") + m[2];
  });
  if (norm.length === 2) {
    const num = (s: string) => Number(s.match(/\d+/)?.[0] ?? 99);
    if (num(norm[0]) > num(norm[1])) return `${norm[1]}/${norm[0]}`;
  }
  return norm.join("/");
}

/**
 * Airport-scoped facility, or null when the text names no runway, taxiway, or apron.
 * The earliest designator in the text wins.
 */
export function notamLocationKey(n: Pick<LearnNotam, "icao" | "text">): string | null {
  const text = (n.text || "").toUpperCase();
  const icao = (n.icao || "").toUpperCase() || "AD";
  const hits: { index: number; key: string }[] = [];

  const rwyRe = /\b(?:RWYS?|RUNWAYS?)\s+(\d{1,2}[LCR]?(?:\s*\/\s*\d{1,2}[LCR]?)?)\b/g;
  const twyRe = /\b(?:TWYS?|TAXIWAYS?)\s+([A-Z]{1,2}\d{0,2})\b/g;
  const apronRe = /\b(?:APRON|APN)\s+([A-Z0-9]{1,4})\b/g;

  for (const re of [rwyRe, twyRe, apronRe]) {
    let m: RegExpExecArray | null;
    const isRwy = re === rwyRe;
    const isTwy = re === twyRe;
    while ((m = re.exec(text)) !== null) {
      const raw = m[1];
      if (!raw) continue;
      const kind = isRwy ? "RWY" : isTwy ? "TWY" : "APRON";
      const des = isRwy ? canonicalRunway(raw) : raw.replace(/\s+/g, "");
      if (!des) continue;
      hits.push({ index: m.index, key: `${icao}|${kind}|${des}` });
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.index - b.index);
  return hits[0].key;
}

export type NotamCondition =
  | "RSC"
  | "CLSD"
  | "SHORTENED"
  | "U/S"
  | "NOT_AVBL"
  | "WIP"
  | "RESTRICT"
  | "INFO";

/** Operational condition, finer than the heading the list already uses. */
export function notamCondition(text: string): NotamCondition {
  const t = (text || "").toUpperCase();
  if (/\b(?:RSC|CRFI)\b/.test(t)) return "RSC";
  if (/\b(?:CLSD|CLOSED|CLOSURE)\b/.test(t)) return "CLSD";
  if (/\b(?:SHORTEN(?:ED)?|DISPLACED)\b/.test(t)) return "SHORTENED";
  if (
    /\bU\/S\b/.test(t) ||
    /\bUNSERVICEABLE\b/.test(t) ||
    /\bOUT\s+OF\s+SERVICE\b/.test(t) ||
    /\bOTS\b/.test(t) ||
    /\bINOP(?:ERATIVE)?\b/.test(t)
  ) {
    return "U/S";
  }
  if (
    /\bNOT\s+AUTH/.test(t) ||
    /\bNOT\s+AVBL\b/.test(t) ||
    /\bNOT\s+AVAILABLE\b/.test(t) ||
    /\bUNAVAILABLE\b/.test(t) ||
    /\bUNAVBL\b/.test(t)
  ) {
    return "NOT_AVBL";
  }
  if (/\bWIP\b/.test(t) || /\bWORK\s+IN\s+PROGRESS\b/.test(t) || /\bCONSTRUCTION\b/.test(t)) {
    return "WIP";
  }
  if (/\bRESTRICT/.test(t) || /\bLIMIT(?:ED|ATION|S)?\b/.test(t)) return "RESTRICT";
  return "INFO";
}

/** Global learned type: existing group + condition. Not a new heading. */
export function notamTypeKey(n: Pick<LearnNotam, "text" | "group">): string {
  return `${n.group}|${notamCondition(n.text)}`;
}

const DIRECT_WEIGHT = 2;
const LEARNED_WEIGHT = 1;

export function relevanceScore(n: LearnNotam, prefs: LearnPrefs): number {
  let score = 0;
  const direct = prefs.items[notamIdentity(n)];
  if (direct === "up") score += DIRECT_WEIGHT;
  else if (direct === "down") score -= DIRECT_WEIGHT;
  const loc = notamLocationKey(n);
  if (loc) {
    const lv = prefs.locations[loc];
    if (lv === "up") score += LEARNED_WEIGHT;
    else if (lv === "down") score -= LEARNED_WEIGHT;
  }
  const tv = prefs.types[notamTypeKey(n)];
  if (tv === "up") score += LEARNED_WEIGHT;
  else if (tv === "down") score -= LEARNED_WEIGHT;
  return score;
}

/**
 * Hidden only for N/A (direct, or learned location/type).
 * Direct up, down, or unmark ("shown") stays on the main list.
 */
export function isNotamHidden(n: LearnNotam, prefs: LearnPrefs): boolean {
  const direct = prefs.items[notamIdentity(n)];
  if (direct === "up" || direct === "down" || direct === "shown") return false;
  if (direct === "na") return true;
  const loc = notamLocationKey(n);
  if (loc && prefs.locations[loc] === "na") return true;
  if (prefs.types[notamTypeKey(n)] === "na") return true;
  return false;
}

export function voteNotam(prefs: LearnPrefs, n: LearnNotam, vote: LearnVote): LearnPrefs {
  const items = { ...prefs.items, [notamIdentity(n)]: vote };
  const locations = { ...prefs.locations };
  const loc = notamLocationKey(n);
  if (loc) locations[loc] = vote;
  const types = { ...prefs.types, [notamTypeKey(n)]: vote };
  return { ...prefs, items, locations, types };
}

/** Return one NOTAM to the main list without clearing learned rules for others. */
export function unmarkNotam(prefs: LearnPrefs, n: LearnNotam): LearnPrefs {
  return { ...prefs, items: { ...prefs.items, [notamIdentity(n)]: "shown" } };
}

export function applyLearnToGroup(
  items: NotamItem[],
  prefs: LearnPrefs,
  learnOn: boolean
): { visible: NotamItem[]; hidden: NotamItem[] } {
  if (!learnOn) return { visible: items, hidden: [] };
  const hidden: NotamItem[] = [];
  const shown: NotamItem[] = [];
  for (const n of items) {
    if (isNotamHidden(n, prefs)) hidden.push(n);
    else shown.push(n);
  }
  const ranked = shown.map((n, i) => ({ n, i, s: relevanceScore(n, prefs) }));
  ranked.sort((a, b) => b.s - a.s || a.i - b.i);
  return { visible: ranked.map((r) => r.n), hidden };
}

export function directMark(prefs: LearnPrefs, n: LearnNotam): ItemMark | undefined {
  return prefs.items[notamIdentity(n)];
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
}

function sanitizeMap<T extends string>(value: unknown, allowed: Set<T>): Record<string, T> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!k || typeof v !== "string" || !allowed.has(v as T)) continue;
    out[k] = v as T;
  }
  return out;
}

export function parseLearnPrefs(raw: unknown): LearnPrefs {
  if (!raw || typeof raw !== "object") return emptyLearnPrefs();
  const o = raw as Record<string, unknown>;
  return {
    learnOn: o.learnOn === true,
    items: sanitizeMap(o.items, ITEM_MARKS),
    locations: sanitizeMap(o.locations, VOTES),
    types: sanitizeMap(o.types, VOTES),
  };
}

function defaultStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadLearnPrefs(storage?: StorageLike | null): LearnPrefs {
  const s = storage === undefined ? defaultStorage() : storage;
  if (!s) return emptyLearnPrefs();
  try {
    const raw = s.getItem(LEARN_PREFS_STORAGE_KEY);
    if (!raw) return emptyLearnPrefs();
    return parseLearnPrefs(JSON.parse(raw));
  } catch {
    return emptyLearnPrefs();
  }
}

export function saveLearnPrefs(prefs: LearnPrefs, storage?: StorageLike | null): void {
  const s = storage === undefined ? defaultStorage() : storage;
  if (!s?.setItem) return;
  try {
    s.setItem(LEARN_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota / private mode */
  }
}

export interface LearnTextPart {
  text: string;
  nonStandard: boolean;
}

const CHUNK = /[A-Za-z0-9]+(?:[/'’.\-][A-Za-z0-9]+)*/g;

function segmentIsStandard(tok: string, icao?: string): boolean {
  if (!/[A-Z]/.test(tok)) return true;
  if (icao && tok === icao.toUpperCase()) return true;
  if (AVIATION_TERMS.has(tok)) return true;
  // 1–3 letters: abbreviations and navaid idents (VOR "YYZ"). Longer words must be listed.
  if (/^[A-Z]{1,3}$/.test(tok)) return true;
  if (/^\d{1,2}[LCR]$/.test(tok)) return true;
  if (/^[A-Z]{1,2}\d{1,2}[A-Z]?$/.test(tok)) return true;
  if (/^[NSEW]\d{2,7}$/.test(tok) || /^\d{2,7}[NSEW]$/.test(tok)) return true;
  if (/^\d{4,6}[NS]\d{5,7}[EW]$/.test(tok)) return true;
  if (/^Q[A-Z]{4}$/.test(tok)) return true;
  if (/^[A-Z]\d{3,5}$/.test(tok)) return true;
  if (/^\d{4,12}Z$/.test(tok)) return true;
  if (/^A\d{4}$/.test(tok) || /^Q\d{3,4}$/.test(tok)) return true;
  if (/^\d+(?:\.\d+)?(?:FT|M|KM|NM|SM|KT|KTS|FL|AGL|MSL|HPA|MB|HG|PCT|MHZ|KHZ)$/.test(tok)) {
    return true;
  }
  if (/^CY[RAD]\d{1,4}$/.test(tok)) return true;
  if (/^[RPDW]-?\d{2,5}$/.test(tok)) return true;
  return false;
}

/** Alphabetic token outside the fixed list, ignoring numbers, coords, times, NOTAM ids. */
export function isNonStandardToken(raw: string, icao?: string): boolean {
  const tok = raw.toUpperCase().replace(/’/g, "'");
  if (!/[A-Z]/.test(tok)) return false;
  if (/^[A-Z]\d{3,5}\/\d{2,4}$/.test(tok)) return false;
  if (/[/'’.\-]/.test(tok)) {
    const parts = tok.split(/[/'’.\-]/).filter(Boolean);
    if (parts.length > 1) {
      return parts.some((p) => /[A-Z]/.test(p) && !segmentIsStandard(p, icao));
    }
  }
  return !segmentIsStandard(tok, icao);
}

export function splitLearnTokens(text: string, icao?: string): LearnTextPart[] {
  const out: LearnTextPart[] = [];
  if (!text) return out;
  const re = new RegExp(CHUNK.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const i = m.index;
    if (i > last) out.push({ text: text.slice(last, i), nonStandard: false });
    const word = m[0];
    out.push({ text: word, nonStandard: isNonStandardToken(word, icao) });
    last = i + word.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), nonStandard: false });
  return out;
}

export function nonStandardTokens(text: string, icao?: string): string[] {
  return splitLearnTokens(text, icao)
    .filter((p) => p.nonStandard)
    .map((p) => p.text);
}
