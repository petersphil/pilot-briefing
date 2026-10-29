/**
 * Briefing regions. CYWG and CYQT sit on the boundary and belong to both.
 */
export type RegionKey = "west" | "east";

export interface Region {
  key: RegionKey;
  label: string;
  short: string;
  airports: string[];
}

export const REGIONS: Region[] = [
  {
    key: "west",
    label: "Western CA",
    short: "West CA",
    airports: [
      "CYYJ", "CYVR", "CYXX", "CYLW", "CYXC", "CYYC", "CYEG", "CYQF",
      "CYXE", "CYQR", "CYWG", "CYQT",
    ],
  },
  {
    key: "east",
    label: "Eastern CA",
    short: "East CA",
    airports: ["CYWG", "CYQT", "CYAM", "CYSB", "CYYZ", "CYHM", "CYOW", "CYUL", "CYYT"],
  },
];

export function parseAirportList(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/** Union of selected regions + custom airports, de-duplicated, order preserved. */
export function airportsForSelection(regions: RegionKey[], custom: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (c: string) => {
    const k = c.toUpperCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  };
  for (const r of REGIONS) if (regions.includes(r.key)) r.airports.forEach(add);
  custom.forEach(add);
  return out;
}

/** Header text: "Western CA", "Western CA + Eastern CA", "CYOJ, CYSM, CYZF", or both. */
export function selectionLabel(regions: RegionKey[], custom: string[]): string {
  const parts: string[] = REGIONS.filter((r) => regions.includes(r.key)).map((r) => r.label);
  const regionText = parts.join(" + ");
  const customText = custom.join(", ");
  if (regionText && customText) return `${regionText} + ${customText}`;
  return regionText || customText;
}
