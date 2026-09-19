#!/usr/bin/env bash
# Static-export the Next.js UI for Capacitor, then sync the Android project.
# API routes are temporarily moved aside because `output: 'export'` cannot include them.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API_DIR="src/app/api"
STASH_DIR="src/app/_api_server_only_stash"

cleanup() {
  if [[ -d "$STASH_DIR" ]]; then
    rm -rf "$API_DIR"
    mv "$STASH_DIR" "$API_DIR"
    echo "Restored $API_DIR"
  fi
}
trap cleanup EXIT

if [[ -d "$API_DIR" ]]; then
  rm -rf "$STASH_DIR"
  mv "$API_DIR" "$STASH_DIR"
  echo "Stashed API routes for static export"
fi

export CAPACITOR_BUILD=1
export NEXT_PUBLIC_CLIENT_BRIEFING=1

echo "Building static export (CAPACITOR_BUILD=1)..."
npx next build

if [[ ! -d out ]]; then
  echo "ERROR: expected out/ after static export" >&2
  exit 1
fi

# Capacitor needs an index.html at webDir root
if [[ ! -f out/index.html ]]; then
  # With trailingSlash, Next may emit out/index.html or out/index/index.html
  if [[ -f out/index/index.html ]]; then
    cp out/index/index.html out/index.html
  else
    echo "ERROR: no index.html in out/" >&2
    find out -name 'index.html' | head -20
    exit 1
  fi
fi

if [[ ! -d android ]]; then
  echo "Adding Capacitor Android platform..."
  npx cap add android
fi

echo "Syncing Capacitor Android..."
npx cap sync android

echo "Done. Open Android Studio with: npm run open:android"
echo "Or build a debug APK with Gradle / GitHub Actions."
