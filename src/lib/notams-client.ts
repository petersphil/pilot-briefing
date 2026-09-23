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
  runway: "RUNWAYS",
  taxiway: "TAXIWAYS",
  fuel: "FUEL",
  ifr_approach: "APPROACH",
  lighting: "LIGHTING",
  other: "OTHER",
};
