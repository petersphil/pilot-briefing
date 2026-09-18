# Pilot Briefing

Mobile-first IFR **flight briefing** web app for **Phil Peters**.

Coverage focus: **Canada · USA · Caribbean**. Enter **ICAO or IATA** (IATA resolves to ICAO). All times are **UTC**. Direct flights only: departure, destination, and IFR alternate(s) — no enroute stops in the UI.

Built with **Next.js (App Router) + TypeScript** so one Node process serves the UI and API proxy (avoids browser CORS against FAA AWC).

## Features

1. **Form** — departure, destination, multi-alternates, departure datetime (UTC), enroute duration  
2. **METAR / TAF / NOTAMs** for all airports — weather from [aviationweather.gov](https://aviationweather.gov/data/api/) (FAA AWC Data API)  
3. **Bundled airport DB** (OurAirports subset) for IATA↔ICAO and **west→east** longitude sort  
4. **FAA flight-category colours** on badges and cards  
5. **Tabs** — METARs · TAF @ dep · +6h · +12h · +18h · +24h · NOTAMs (horizons relative to **departure UTC**)  
6. **NOTAM groups** (in order): runway closures/construction/shortening/restrictions → taxiway → fuel/fueler → IFR approach restrictions → airport/approach lighting. **Excludes** crane, birds, wildlife  

### Colour legend (FAA)

| Category | Colour | Ceiling (AGL) | Visibility |
|----------|--------|---------------|------------|
| **VFR**  | `#008000` green | > 3000 ft | > 5 SM |
| **MVFR** | yellow | 1000–3000 ft | 3–5 SM |
| **IFR**  | red | 500–999 ft | 1–\<3 SM |
| **LIFR** | magenta `#FF00FF` | \< 500 ft | \< 1 SM |

## Quick start (local)

```bash
git clone https://github.com/petersphil/pilot-briefing.git
cd pilot-briefing
cp .env.example .env.local   # optional
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build
npm start                    # listens 0.0.0.0:${PORT:-3000}
```

### Environment variables

| Variable | Purpose |
|----------|---------|
| `AWC_API_BASE` | Override AWC API root (default `https://aviationweather.gov/api/data`) |
| `AWC_USER_AGENT` | Custom User-Agent (AWC asks for one) |
| `FAA_NOTAM_CLIENT_ID` / `FAA_NOTAM_CLIENT_SECRET` | Live **US** NOTAMs via FAA External API |
| `FAA_NOTAM_TOKEN_URL` / `FAA_NOTAM_API_BASE` | Override FAA OAuth / API hosts if needed |
| `ENABLE_SAMPLE_NOTAMS=1` | Dev-only sample NOTAMs when FAA creds absent |
| `PORT` | Production listen port (default 3000) |

## Deploy on a VPS (nginx + Node)

This app is **not** a static export — API routes must run on Node.

1. Install Node 20+ on the VPS.  
2. Clone the repo, `npm ci && npm run build`.  
3. Copy `.env.example` → `.env.local` (or systemd `Environment=`) and set NOTAM credentials if you have them.  
4. Run with the standalone server (after `output: "standalone"` build):

```bash
# Option A — next start
npm start

# Option B — standalone (smaller deploy footprint)
node .next/standalone/server.js
# also copy public/ and .next/static into the standalone tree per Next docs
```

5. Put **nginx** in front (see `deploy/nginx-pilot-briefing.conf.example`), obtain TLS with certbot.  
6. Optional systemd unit:

```ini
[Unit]
Description=Pilot Briefing
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/pilot-briefing
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Static hosting alone (S3/Netlify static) will **not** work without a separate API host; prefer one Node process behind nginx.

## Data sources & coverage

| Product | Source | CA / US / Caribbean |
|---------|--------|---------------------|
| METAR | FAA AWC `/api/data/metar` | Worldwide stations (CA & Caribbean included where reported) |
| TAF | FAA AWC `/api/data/taf` | Same |
| Airports | OurAirports subset in `data/airports.json` | CA, US, Caribbean ISOs |
| NOTAMs | FAA NOTAM API (optional credentials) | **US** when configured; see limitations |

Rebuild airports:

```bash
npm run build:airports
```

## NOTAM filters

Primary groups only (others hidden):

1. Runway closures / construction / shortening / restrictions  
2. Taxiway  
3. Fuel / fueler  
4. IFR approach restrictions / limitations  
5. Airport / approach lighting  

**Excluded:** crane, birds, wildlife (keyword filter).

## Known limitations

- **Canadian NOTAMs** are not available from the FAA NOTAM API. NAV CANADA / CFPS (or another AIS feed) is required for complete Canadian briefing NOTAMs — this pilot does not bundle that subscription.  
- **Caribbean NOTAM** completeness varies; many FIRs are outside FAA coverage.  
- Without `FAA_NOTAM_*` credentials, the NOTAM tab is empty (or sample data if `ENABLE_SAMPLE_NOTAMS=1`).  
- AWC rate limit ≈ **100 req/min**; this app batches METAR/TAF by airport list.  
- OurAirports rows can lag official renames; a few IATA↔ICAO overrides are applied in `scripts/build-airports.py`.  
- TAF horizon snapshots pick the governing forecast period at dep/+6/+12/+18/+24 UTC; PROB groups are deprioritized when a base period overlaps.  
- Enroute duration is captured for pilot context; weather tabs are keyed off **departure time**, not ETA (per product requirements).  
- Heliports and most US small fields without IATA are omitted from the bundled DB to keep size reasonable; four-letter ICAO codes still fetch weather even if not in the DB.

## License

MIT — use at your own operational risk. Always cross-check with official briefing sources before flight.
