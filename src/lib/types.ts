export type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR" | "UNK";

export type AirportRole = "departure" | "destination" | "alternate";

export interface Airport {
  icao: string;
  iata: string | null;
  name: string;
  city: string | null;
  country: string;
  lat: number;
  lon: number;
  elev_ft: number | null;
  type: string;
}

export interface ResolvedAirport extends Airport {
  input: string;
  role: AirportRole;
}

export interface CloudLayer {
  cover: string;
  base: number | null;
}

export interface MetarData {
  icaoId: string;
  rawOb: string;
  reportTime?: string;
  temp?: number;
  dewp?: number;
  wdir?: number | string;
  wspd?: number;
  wgst?: number;
  visib?: number | string;
  cover?: string;
  clouds?: CloudLayer[];
  fltCat?: FlightCategory | string;
  wxString?: string;
  altim?: number;
  lat?: number;
  lon?: number;
  name?: string;
}

export interface TafPeriod {
  timeFrom: number;
  timeTo: number;
  timeBec?: number | null;
  fcstChange?: string | null;
  probability?: number | null;
  wdir?: number | string;
  wspd?: number;
  wgst?: number | null;
  visib?: number | string;
  wxString?: string | null;
  clouds?: CloudLayer[];
  vertVis?: number | null;
}

export interface TafData {
  icaoId: string;
  rawTAF: string;
  issueTime?: string;
  validTimeFrom?: number;
  validTimeTo?: number;
  fcsts?: TafPeriod[];
  name?: string;
  lat?: number;
  lon?: number;
}

export type NotamGroup =
  | "runway"
  | "taxiway"
  | "fuel"
  | "ifr_approach"
  | "lighting"
  | "other";

export interface NotamItem {
  id: string;
  icao: string;
  raw: string;
  text: string;
  group: NotamGroup;
  start?: string | null;
  end?: string | null;
  excluded?: boolean;
}

export interface AirportBriefing {
  airport: ResolvedAirport;
  metar: MetarData | null;
  taf: TafData | null;
  flightCategory: FlightCategory;
  tafSnapshots: Record<TafHorizonKey, TafSnapshot | null>;
  notams: NotamItem[];
  notamsByGroup: Record<NotamGroup, NotamItem[]>;
  errors: string[];
}

export type TafHorizonKey = "dep" | "plus6" | "plus12" | "plus18" | "plus24";

export interface TafSnapshot {
  horizon: TafHorizonKey;
  atUtc: string;
  period: TafPeriod | null;
  flightCategory: FlightCategory;
  summary: string;
  rawFragment?: string;
}

export interface BriefingRequest {
  departure: string;
  destination: string;
  alternates: string[];
  departureUtc: string;
  enrouteMinutes: number;
}

export interface BriefingResponse {
  generatedAt: string;
  departureUtc: string;
  enrouteMinutes: number;
  airports: AirportBriefing[];
  sortedWestToEast: string[];
  horizons: { key: TafHorizonKey; label: string; atUtc: string }[];
  notamSource: string;
  warnings: string[];
  coverageNote: string;
}
