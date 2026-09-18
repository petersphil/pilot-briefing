/** Client-safe NOTAM labels (no Node APIs). */
export type NotamGroupClient =
  | "runway"
  | "taxiway"
  | "fuel"
  | "ifr_approach"
  | "lighting"
  | "other";

export const NOTAM_GROUP_ORDER: NotamGroupClient[] = [
  "runway",
  "taxiway",
  "fuel",
  "ifr_approach",
  "lighting",
];

export const NOTAM_GROUP_LABELS: Record<NotamGroupClient, string> = {
  runway: "Runway closures / construction / shortening / restrictions",
  taxiway: "Taxiway",
  fuel: "Fuel / fueler",
  ifr_approach: "IFR approach restrictions / limitations",
  lighting: "Airport / approach lighting",
  other: "Other",
};
