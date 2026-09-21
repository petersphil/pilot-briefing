/**
 * Quick sanity checks for raw TAF parse + NOTAM classify.
 * Run: npx --yes tsx scripts/sanity-taf-notams.ts
 */
import { categoryFromTafPeriod } from "../src/lib/flightCategory";
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
assert(classifyNotam("ILS RWY 28 U/S") === "ifr_approach", 'ILS RWY 28 U/S → ifr_approach');
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
const overlapping = enriched.fcsts!.filter((p) => periodOverlapsWindow(p, win));
assert(overlapping.length >= 1, `window overlaps >=1 period (got ${overlapping.length})`);

const atSec = Math.floor(dep.getTime() / 1000);
const p = periodAt(enriched, atSec);
assert(!!p, "periodAt returns period at dep");

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll sanity checks passed.");
