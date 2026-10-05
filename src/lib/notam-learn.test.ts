import assert from "node:assert/strict";
import test from "node:test";
import type { NotamGroup, NotamItem } from "./types";
import {
  applyLearnToGroup,
  emptyLearnPrefs,
  isNotamHidden,
  LEARN_PREFS_STORAGE_KEY,
  loadLearnPrefs,
  nonStandardTokens,
  notamIdentity,
  notamLocationKey,
  notamTypeKey,
  parseLearnPrefs,
  relevanceScore,
  saveLearnPrefs,
  unmarkNotam,
  voteNotam,
} from "./notam-learn";

function item(
  text: string,
  group: NotamGroup,
  extra: Partial<NotamItem> = {}
): NotamItem {
  return {
    id: extra.id ?? "A100/26",
    icao: extra.icao ?? "CYYZ",
    raw: text,
    text,
    group,
    start: null,
    end: null,
    ...extra,
  };
}

test("location is the first facility, runway pairs canonicalized", () => {
  const a = item("CYYZ RWY 34/16 CLSD", "runway", { id: "1" });
  const b = item("RWY 16/34 CLSD DUE WIP", "runway", { id: "2" });
  assert.equal(notamLocationKey(a), "CYYZ|RWY|16/34");
  assert.equal(notamLocationKey(b), "CYYZ|RWY|16/34");
  assert.equal(
    notamLocationKey(item("TWY A BETWEEN A1 AND A3 CLSD", "taxiway")),
    "CYYZ|TWY|A"
  );
  assert.equal(notamLocationKey(item("FUEL 100LL NOT AVBL", "fuel")), null);
  assert.equal(
    notamLocationKey(item("ILS RWY 28 U/S", "ifr_approach")),
    "CYYZ|RWY|28"
  );
});

test("type is existing group plus condition, not a new heading", () => {
  assert.equal(notamTypeKey(item("RWY 16/34 CLSD DUE TO CONSTRUCTION", "runway")), "runway|CLSD");
  assert.equal(notamTypeKey(item("RSC 02 6/6/6 DRY", "runway")), "runway|RSC");
  assert.equal(notamTypeKey(item("TWY A CLSD", "taxiway")), "taxiway|CLSD");
  assert.equal(notamTypeKey(item("ILS RWY 28 U/S", "ifr_approach")), "ifr_approach|U/S");
  assert.equal(notamTypeKey(item("FUEL 100LL NOT AVBL", "fuel")), "fuel|NOT_AVBL");
  assert.equal(notamTypeKey(item("PAPI RWY 23 U/S", "lighting")), "lighting|U/S");
});

test("stable id is used; synthetic index id follows text", () => {
  const stable = item("RWY 05 CLSD", "runway", { id: "88421" });
  assert.equal(notamIdentity(stable), "id:88421");
  const syn = item("RWY 05 CLSD", "runway", { id: "CYYZ-3" });
  const syn2 = item("RWY 05 CLSD", "runway", { id: "CYYZ-9" });
  assert.equal(notamIdentity(syn), notamIdentity(syn2));
  assert.match(notamIdentity(syn), /^txt:CYYZ:/);
});

test("learn off leaves order and hides nothing", () => {
  const prefs = voteNotam(
    emptyLearnPrefs(),
    item("RWY 05/23 CLSD", "runway", { id: "1" }),
    "na"
  );
  const list = [
    item("RWY 05/23 CLSD", "runway", { id: "1" }),
    item("RWY 15/33 CLSD", "runway", { id: "2" }),
  ];
  const applied = applyLearnToGroup(list, prefs, false);
  assert.deepEqual(applied.visible.map((n) => n.id), ["1", "2"]);
  assert.equal(applied.hidden.length, 0);
});

test("N/A hides and teaches type or location; down never hides", () => {
  const closure = item("RWY 05/23 CLSD", "runway", { id: "1" });
  const otherRwy = item("RWY 15/33 CLSD", "runway", { id: "2" });
  const sameRwyRsc = item("RSC RWY 05/23 6/6/6 DRY", "runway", { id: "3" });
  const twy = item("TWY B CLSD", "taxiway", { id: "4" });
  const later = item("RWY 06/24 CLSD", "runway", { id: "9", icao: "CYVR" });
  let prefs = voteNotam(emptyLearnPrefs(), closure, "na");
  assert.equal(isNotamHidden(closure, prefs), true);
  assert.equal(isNotamHidden(otherRwy, prefs), true);
  assert.equal(isNotamHidden(later, prefs), true);
  assert.equal(isNotamHidden(sameRwyRsc, prefs), true);
  assert.equal(isNotamHidden(twy, prefs), false);

  const down = item("RWY 01/19 CLSD", "runway", { id: "5" });
  prefs = voteNotam(emptyLearnPrefs(), down, "down");
  assert.equal(isNotamHidden(down, prefs), false);
  const cousin = item("RWY 02/20 CLSD", "runway", { id: "6" });
  assert.equal(isNotamHidden(cousin, prefs), false);
  assert.ok(relevanceScore(cousin, prefs) < 0);
  assert.ok(relevanceScore(down, prefs) < relevanceScore(cousin, prefs));
});

test("up reorders inside the list and inherited type sorts above unrelated", () => {
  const low = item("RSC RWY 15/33 5/5/5 DRY", "runway", { id: "rsc" });
  const mid = item("RWY 06/24 CLSD", "runway", { id: "other" });
  const voted = item("RWY 05/23 CLSD", "runway", { id: "voted" });
  const prefs = voteNotam(emptyLearnPrefs(), voted, "up");
  const { visible, hidden } = applyLearnToGroup([low, mid, voted], prefs, true);
  assert.deepEqual(hidden, []);
  assert.deepEqual(
    visible.map((n) => n.id),
    ["voted", "other", "rsc"]
  );
});

test("ties keep the original order", () => {
  const a = item("RSC 02 6/6/6 DRY", "runway", { id: "a" });
  const b = item("RSC 20 5/5/5 WET", "runway", { id: "b" });
  const { visible } = applyLearnToGroup([a, b], emptyLearnPrefs(), true);
  assert.deepEqual(visible.map((n) => n.id), ["a", "b"]);
});

test("unmark returns that NOTAM only; learned N/A still hides the type", () => {
  const closure = item("RWY 05/23 CLSD", "runway", { id: "1" });
  const other = item("RWY 15/33 CLSD", "runway", { id: "2" });
  let prefs = voteNotam(emptyLearnPrefs(), closure, "na");
  prefs = unmarkNotam(prefs, closure);
  assert.equal(isNotamHidden(closure, prefs), false);
  assert.equal(isNotamHidden(other, prefs), true);
  const { visible, hidden } = applyLearnToGroup([closure, other], prefs, true);
  assert.deepEqual(visible.map((n) => n.id), ["1"]);
  assert.deepEqual(hidden.map((n) => n.id), ["2"]);
});

test("direct up or down stays visible even if the type rule is still N/A", () => {
  const n = item("RWY 05/23 CLSD", "runway", { id: "1" });
  const prefs = {
    ...emptyLearnPrefs(),
    items: { [notamIdentity(n)]: "up" as const },
    types: { [notamTypeKey(n)]: "na" as const },
    locations: {},
  };
  assert.equal(isNotamHidden(n, prefs), false);
});

test("prefs round-trip in localStorage and drop unknown marks", () => {
  const mem: Record<string, string> = {};
  const storage = {
    getItem: (k: string) => (k in mem ? mem[k] : null),
    setItem: (k: string, v: string) => {
      mem[k] = v;
    },
  };
  const n = item("TWY A CLSD", "taxiway", { id: "T1" });
  const prefs = voteNotam({ ...emptyLearnPrefs(), learnOn: true }, n, "down");
  saveLearnPrefs(prefs, storage);
  assert.ok(mem[LEARN_PREFS_STORAGE_KEY]);
  const loaded = loadLearnPrefs(storage);
  assert.equal(loaded.learnOn, true);
  assert.equal(loaded.items[notamIdentity(n)], "down");
  assert.equal(loaded.types[notamTypeKey(n)], "down");
  assert.equal(loaded.locations[notamLocationKey(n)!], "down");
  const dirty = parseLearnPrefs({
    learnOn: "yes",
    items: { a: "nope", b: "shown" },
    locations: { x: "up", y: 1 },
    types: null,
  });
  assert.equal(dirty.learnOn, false);
  assert.deepEqual(dirty.items, { b: "shown" });
  assert.deepEqual(dirty.locations, { x: "up" });
  assert.deepEqual(dirty.types, {});
});

test("ordinary NOTAM shorthand is not red; unusual words are", () => {
  const ordinary: Array<[string, string]> = [
    ["CYYZ", "CYYZ RWY 16/34 CLSD DUE TO CONSTRUCTION 1200-2200 DAILY"],
    ["CYYZ", "CYYZ TWY A BETWEEN A1 AND A3 CLSD"],
    ["CYYZ", "CYYZ FUEL 100LL NOT AVBL"],
    ["CYYZ", "CYYZ ILS RWY 28 U/S"],
    ["CYYZ", "CYYZ ALSF-2 RWY 10 OUT OF SERVICE"],
    ["CYYZ", "RWY 05/23 CLSD DUE MAINT. MEN AND EQUIPMENT WORKING."],
    ["CYYZ", "TWY B BTN TWY A AND TWY C CLSD"],
    ["CYYZ", "APCH LGT RWY 15R U/S"],
    ["CYYZ", "NAV ILS RWY 23 GP U/S"],
    ["CYYZ", "OBST LGT ON TWR 433856N 0792412W U/S"],
    ["CYYZ", "RSC 02 6/6/6 DRY 100 PCT COMPACTED SNOW"],
    ["CYYZ", "RSC 05 5/3/1 WET ICE"],
    ["CYYZ", "LDA RWY 06 7500FT"],
    ["CYYZ", "NOT AUTH ACFT WINGSPAN MORE THAN 36M"],
    ["CYYZ", "RWY 05/23 SHORTENED 500FT DUE WIP"],
    ["CYYZ", "HIRL RWY 15/33 U/S"],
    ["CYYZ", "PAPI RWY 23 U/S"],
    ["CYYZ", "VOR YYZ 115.5 MHZ U/S"],
    ["CYYZ", "FUEL JET A1 NOT AVBL H24"],
    ["CYYZ", "A1234/26 NOTAMN RWY 06L/24R CLSD 2601011200-2601012200"],
    ["CYYZ", "CRFI RWY 05/23 0.40"],
    ["CYYZ", "SNOW REMOVAL IN PROGRESS RWY 15/33"],
    ["CYYZ", "DECLARED DISTANCES RWY 05 TODA 9000FT LDA 8500FT"],
    ["CYYZ", "SID AND STAR RNAV PROC NOT AVBL"],
    ["CYYZ", "GPS RAIM OUTAGE PREDICTED 1200-1400"],
    ["CYYZ", "MALSR RWY 24R OUT OF SERVICE"],
    ["CYYZ", "AERODROME CLSD TO ALL ACFT EXC MEDEVAC"],
    ["CYYZ", "PPR REQUIRED FOR ALL ACFT"],
  ];
  const misses: string[] = [];
  for (const [icao, text] of ordinary) {
    const bad = nonStandardTokens(text, icao);
    if (bad.length) misses.push(`${text} => ${bad.join(",")}`);
  }
  assert.deepEqual(misses, []);
  assert.deepEqual(nonStandardTokens("CYYZ CRANE 1NM NE OF AD 250FT AGL", "CYYZ"), ["CRANE"]);
  assert.deepEqual(nonStandardTokens("BIRD ACTIVITY IN VICINITY", "CYYZ"), ["BIRD"]);
  assert.ok(nonStandardTokens("DRONE SHOW FESTIVAL SOUTH OF AD", "CYYZ").includes("FESTIVAL"));
  assert.ok(nonStandardTokens("DRONE SHOW FESTIVAL SOUTH OF AD", "CYYZ").includes("DRONE"));
  assert.deepEqual(nonStandardTokens("4339N07938W 1200Z", "CYYZ"), []);
});
