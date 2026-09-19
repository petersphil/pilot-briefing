# Pilot Briefing — Android (Capacitor) sideload

Installable **debug APK** that runs the briefing UI on-device and calls weather/NOTAM APIs via **CapacitorHttp** (bypasses WebView CORS). No WHM/server required on the phone.

App ID: `ca.empressaero.pilotbriefing` · Web assets from Next.js static export (`out/`).

## Get the APK (easiest)

### One-time: enable the GitHub Actions workflow

The OAuth token used by automation cannot create workflow files (`workflow` scope). Add it once in the GitHub UI:

1. Open [Create new file](https://github.com/petersphil/pilot-briefing/new/main?filename=.github/workflows/android-apk.yml) on `main`.
2. Paste the contents of [`deploy/android-apk.yml`](./deploy/android-apk.yml) and commit.
3. Or locally: `mkdir -p .github/workflows && cp deploy/android-apk.yml .github/workflows/ && git add .github && git commit && git push` (needs a token/PAT with the `workflow` scope).

### Download the APK

1. Open the GitHub repo → **Actions** → workflow **Android debug APK**.
2. Run **workflow_dispatch** (“Run workflow”) on `main`, or wait for a push to `main`.
3. When the run finishes, download the artifact **`pilot-briefing-debug-apk`**.
4. Unzip and copy `app-debug.apk` to your phone.
5. On Android: enable **Install unknown apps** / **Unknown sources** for your file manager or browser, then open the APK to install.

### After install — RapidAPI key (US / Caribbean NOTAMs)

1. Open **Pilot Briefing** → **Settings**.
2. Paste your **RapidAPI** key for [SkyLink](https://rapidapi.com/) (personal use only).
3. Tap **Save key** — stored on the device only (`localStorage` + Capacitor Preferences).
4. **Canadian NOTAMs** (NAV CANADA CFPS) need **no key**.

METAR/TAF always use HTTPS `aviationweather.gov` (no key).

## Architecture

| Mode | How briefing runs |
|------|-------------------|
| Server (`npm run build`) | Next.js standalone + `POST /api/briefing` proxy (WHM / VPS) |
| Capacitor Android | Static export + client `buildBriefing` + `CapacitorHttp` |

Detection: `Capacitor.isNativePlatform()` or `NEXT_PUBLIC_CLIENT_BRIEFING=1` (set during Android export).

## Build locally (Windows / Android Studio / WSL2)

Requirements: Node 20+, JDK 21, Android SDK (Android Studio is simplest).

```bash
git clone https://github.com/petersphil/pilot-briefing.git
cd pilot-briefing
npm ci
npm run build:android    # static export → out/ → cap sync android
npm run open:android     # opens Android Studio
```

In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.  
Debug APK path: `android/app/build/outputs/apk/debug/app-debug.apk`.

Or from the CLI (SDK + `ANDROID_HOME` set):

```bash
cd android
./gradlew assembleDebug
```

### WSL2 notes

- Install Android Studio on Windows; point WSL at the SDK, or build entirely inside WSL with cmdline-tools.
- USB device debugging from WSL needs `usbipd` or copy the APK to Windows and sideload.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Server deploy (standalone) — unchanged |
| `npm run build:android` | `CAPACITOR_BUILD=1` static export + `cap sync` |
| `npm run open:android` | Open Android Studio project |
| `npm run sync:android` | `npx cap sync android` only |

## CORS / HTTPS

Third-party APIs block browser CORS in the Android WebView. This app uses `@capacitor/core` **CapacitorHttp** through `nativeAwareFetch()` when native. Prefer HTTPS only (cleartext disabled in `capacitor.config.ts`).

## Troubleshooting

- **No NOTAMs for US airports** — set RapidAPI key in Settings.
- **Blank screen after update** — uninstall old build, install new debug APK.
- **Actions failed** — check the “Static export + Capacitor sync” and Gradle logs; re-run workflow_dispatch.
