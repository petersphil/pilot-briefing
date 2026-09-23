/**
 * Quick sanity checks for raw TAF parse + NOTAM classify + NOTAM display.
 * Run: npx --yes tsx scripts/sanity-taf-notams.ts
 */
import { categoryFromTafPeriod } from "../src/lib/flightCategory";
import {
  notamOverlapsFlightWindow,
  rscColor,
  tokenizeNotamForDisplay,
} from "../src/lib/notam-display";
import { classifyNotam } from "../src/lib/notams";
import { buildTafSnapshots, periodAt } from "../src/lib/taf";
import {
  ensureTafFcsts,
  parseRawTaf,
  periodOverlapsWindow,
  flightWindowUnix,
} from "../src/lib/taf-parse";
import type { TafData } from "../src/lib/types";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK:", msg);
  }
}

// --- NOTAM classify ---
assert(classifyNotam("ILS RWY 28 U/S") === "ifr_approach", "ILS RWY 28 U/S → ifr_approach");
assert(classifyNotam("RWY 16/34 CLSD") === "runway", "RWY 16/34 CLSD → runway");
assert(classifyNotam("ALSF-2 RWY 10 U/S") === "lighting", "ALSF-2 RWY 10 U/S → lighting");
assert(classifyNotam("TWY A CLSD") === "taxiway", "TWY A CLSD → taxiway");
assert(classifyNotam("FUEL 100LL NOT AVBL") === "fuel", "FUEL → fuel");

// --- TAF parse: KDEN-like with FM/TEMPO FG (LIFR) ---
const kden = `TAF AMD KDEN 201730Z 2018/2124 09008KT P6SM SCT120 BKN200
FM202100 12012KT P6SM BKN080
TEMPO 2021/2102 1/2SM FG VV002
FM210600 18015G25KT 4SM -SN BKN025
BECMG 2110/2112 27010KT P6SM SCT040`;

const issue = "2026-09-20T17:30:00Z";
const parsed = parseRawTaf(kden.replace(/\n/g, " "), issue);
assert(parsed.fcsts.length >= 4, `KDEN periods >= 4 (got ${parsed.fcsts.length})`);
assert(parsed.clauses.length >= 4, `KDEN clauses >= 4 (got ${parsed.clauses.length})`);

const tempo = parsed.fcsts.find((p) => p.fcstChange === "TEMPO");
assert(!!tempo, "TEMPO period present");
if (tempo) {
  const cat = categoryFromTafPeriod(tempo);
  assert(cat === "LIFR", `TEMPO FG VV002 → LIFR (got ${cat})`);
  assert(
    String(tempo.visib).includes("1/2") || parseFloat(String(tempo.visib)) < 1,
    `TEMPO vis ~1/2SM (got ${tempo.visib})`
  );
}

const fm = parsed.fcsts.filter((p) => p.fcstChange === "FM");
assert(fm.length >= 2, `FM groups >= 2 (got ${fm.length})`);

// --- CYYC sample ---
const cyyc = `TAF CYYC 201740Z 2018/2124 27012KT P6SM SCT030 BKN120
TEMPO 2018/2102 3SM -SN BKN020
FM210200 30015G25KT 2SM -SN BKN015`;
const cyycParsed = parseRawTaf(cyyc.replace(/\n/g, " "), issue);
assert(cyycParsed.fcsts.length >= 3, `CYYC periods >= 3 (got ${cyycParsed.fcsts.length})`);
const cyycFm = cyycParsed.fcsts.find((p) => p.fcstChange === "FM");
if (cyycFm) {
  const cat = categoryFromTafPeriod(cyycFm);
  assert(cat === "IFR", `CYYC FM 2SM BKN015 → IFR (got ${cat})`);
}

// --- ensureTafFcsts + snapshots stop being UNK ---
const taf: TafData = {
  icaoId: "KDEN",
  rawTAF: kden.replace(/\n/g, " "),
  issueTime: issue,
};
const enriched = ensureTafFcsts(taf)!;
assert(!!enriched.fcsts?.length, "ensureTafFcsts fills fcsts");

const dep = new Date("2026-09-20T21:30:00Z");
const snaps = buildTafSnapshots(taf, dep);
assert(snaps.dep?.flightCategory !== "UNK", `dep category not UNK (got ${snaps.dep?.flightCategory})`);
assert(!!snaps.dep?.period, "dep has period");

// Flight window bold overlap: dep 21:30, enroute 60 → window to 00:30 next day
const win = flightWindowUnix(dep, 60);
const overlappingPeriods = enriched.fcsts!.filter((p) => periodOverlapsWindow(p, win));
assert(overlappingPeriods.length >= 1, `window overlaps >=1 period (got ${overlappingPeriods.length})`);

const atSec = Math.floor(dep.getTime() / 1000);
const p = periodAt(enriched, atSec);
assert(!!p, "periodAt returns period at dep");

// --- NOTAM display: flight window + hazard/RSC spans ---
const depNotam = new Date("2026-09-22T18:00:00Z");
assert(
  notamOverlapsFlightWindow(
    { start: "2026-09-22T17:00:00Z", end: "2026-09-22T22:00:00Z" },
    depNotam,
    60
  ),
  "NOTAM overlapping flight window"
);
assert(
  !notamOverlapsFlightWindow(
    { start: "2026-09-23T12:00:00Z", end: "2026-09-23T18:00:00Z" },
    depNotam,
    60
  ),
  "NOTAM outside flight window"
);
assert(
  notamOverlapsFlightWindow({ start: null, end: null }, depNotam, 60),
  "missing start/end treated as always valid"
);

const clsdTokens = tokenizeNotamForDisplay("CYYC RWY 17L/35R CLSD DUE WIP", true);
const hazard = clsdTokens.find((t) => t.kind === "hazard");
assert(
  !!hazard && /RWY 17L\/35R CLSD/i.test(hazard.text),
  `CLSD hazard span (got ${hazard?.text})`
);
assert(hazard?.bold === true, "CLSD hazard bold");

const rsc6 = tokenizeNotamForDisplay("RSC 6 ALL TWY", true);
assert(!!rsc6.find((t) => t.kind === "rsc" && t.rscLevel === 6), "RSC 6 token");
assert(rscColor(6) === "#22c55e", "RSC 6 → green");

const rsc2 = tokenizeNotamForDisplay("RSC2 RWY 16", true);
assert(!!rsc2.find((t) => t.kind === "rsc" && t.rscLevel === 2), "RSC2 token");
assert(rscColor(2) === "#ef4444", "RSC 2 → red");

const multi = tokenizeNotamForDisplay("RSC 5/3/1", true);
const levels = multi.filter((t) => t.kind === "rsc").map((t) => t.rscLevel);
assert(
  levels[0] === 5 && levels[1] === 3 && levels[2] === 1,
  `RSC 5/3/1 thirds (got ${levels.join("/")})`
);
assert(
  rscColor(5) === "#22c55e" && rscColor(3) === "#eab308" && rscColor(1) === "#ef4444",
  "RSC multi colours"
);

const muted = tokenizeNotamForDisplay("TWY A CLSD", false);
assert(
  muted.every((t) => (t.kind === "text" ? t.bold === false : true)),
  "out-of-window plain text not bold"
);
assert(
  tokenizeNotamForDisplay("RWY 16/34 CLSD", false).some((t) => t.kind === "hazard"),
  "hazard still highlighted out-of-window"
);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll sanity checks passed.");
