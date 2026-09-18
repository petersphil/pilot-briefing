#!/usr/bin/env python3
"""Rebuild data/airports.json from OurAirports CSV (CA / US / Caribbean)."""
import csv, json, os, sys, urllib.request

SRC = "https://davidmegginson.github.io/ourairports-data/airports.csv"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "airports.json")

CARIBBEAN = {
    "AI","AG","AW","BS","BB","BQ","CU","CW","DM","DO","GD","GP","HT","JM",
    "MQ","MS","PR","BL","KN","LC","MF","VC","SX","TT","TC","VG","VI","KY","BM",
}
ISO_OK = {"CA", "US"} | CARIBBEAN
TYPES = {"large_airport", "medium_airport", "small_airport", "seaplane_base"}
IATA_OVERRIDES = {"PBI": "KPBI"}
ICAO_ALIASES = {"KDJT": "KPBI"}


def main():
    dest = "/tmp/ourairports-airports.csv"
    print("Downloading", SRC)
    urllib.request.urlretrieve(SRC, dest)
    airports = []
    with open(dest, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            iso = (row.get("iso_country") or "").upper()
            if iso not in ISO_OK:
                continue
            typ = row.get("type") or ""
            if typ not in TYPES:
                continue
            ident = (row.get("ident") or "").upper().strip()
            gps = (row.get("gps_code") or "").upper().strip()
            iata = (row.get("iata_code") or "").upper().strip() or None
            code = ident if len(ident) == 4 else (gps if len(gps) == 4 else "")
            if not code:
                continue
            code = ICAO_ALIASES.get(code, code)
            try:
                lat = float(row["latitude_deg"])
                lon = float(row["longitude_deg"])
            except Exception:
                continue
            elev = row.get("elevation_ft") or None
            try:
                elev = int(float(elev)) if elev not in (None, "") else None
            except Exception:
                elev = None
            airports.append({
                "icao": code,
                "iata": iata,
                "name": row.get("name") or "",
                "city": row.get("municipality") or None,
                "country": iso,
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "elev_ft": elev,
                "type": typ,
            })

    prio = {"large_airport": 0, "medium_airport": 1, "small_airport": 2, "seaplane_base": 3}
    by = {}
    for a in airports:
        k = a["icao"]
        if k not in by or prio.get(a["type"], 9) < prio.get(by[k]["type"], 9):
            by[k] = a
    for iata, icao in IATA_OVERRIDES.items():
        if icao in by:
            by[icao]["iata"] = iata

    # Filter size: large/medium + IATA + all CA small + Caribbean small/seaplane
    kept = []
    for a in by.values():
        if a["type"] in ("large_airport", "medium_airport"):
            kept.append(a)
        elif a.get("iata"):
            kept.append(a)
        elif a["country"] == "CA" and a["type"] == "small_airport":
            kept.append(a)
        elif a["country"] not in ("CA", "US") and a["type"] in ("small_airport", "seaplane_base"):
            kept.append(a)
    kept.sort(key=lambda x: x["icao"])
    iata_map = {a["iata"]: a["icao"] for a in kept if a.get("iata")}
    for iata, icao in IATA_OVERRIDES.items():
        iata_map[iata] = icao

    out = {
        "airports": kept,
        "iataToIcao": iata_map,
        "aliases": ICAO_ALIASES,
        "meta": {
            "source": "OurAirports",
            "url": SRC,
            "coverage": "Canada, USA, Caribbean",
            "count": len(kept),
        },
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"Wrote {len(kept)} airports -> {OUT}")


if __name__ == "__main__":
    main()
