#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source tools/studio-env.sh
cd apps/android
npm ci --no-audit --no-fund
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a
