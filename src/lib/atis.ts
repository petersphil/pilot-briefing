import type { Airport } from "./types";

export type AtisLink = {
  url: string;
  /** Short button label */
  label: string;
  /** Sheet title */
  title: string;
};

/**
 * Per-airport ATIS / aerodrome page for in-app viewing.
 * CA → Nav Canada AeroView (Phil's pattern).
 * US / others → atis.info digital ATIS (common FAA D-ATIS transcript host;
 * FAA has no stable public per-airport ATIS HTML page).
 */
export function atisLinkForAirport(airport: Pick<Airport, "icao" | "country">): AtisLink | null {
  const icao = airport.icao?.trim().toUpperCase();
  if (!icao || icao.length < 3) return null;

  const country = (airport.country || "").toUpperCase();
  const isCanada =
    country === "CA" ||
    country === "CANADA" ||
    ((!country || country === "UNK") && /^C[A-Z]/.test(icao));

  if (isCanada) {
    return {
      url: `https://spaces.navcanada.ca/workspace/aeroview/${icao}`,
      label: "AeroView",
      title: `${icao} · Nav Canada AeroView`,
    };
  }

  // US and Caribbean / other: digital ATIS transcript
  return {
    url: `https://atis.info/${icao}`,
    label: "ATIS",
    title: `${icao} · ATIS`,
  };
}
