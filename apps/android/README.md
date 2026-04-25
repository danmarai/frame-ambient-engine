# Frame Art Android App

React Native / Expo companion app for Samsung Frame TV art management.

## Architecture

- **Connect screen**: auto-detects phone subnet, scans for Frame TVs, manual IP entry
- **Gallery screen**: shows cloud-generated art, push to TV via native TCP upload
- **Studio screen**: WebView loading `frameapp.dmarantz.com/studio` with bidirectional JS bridge
- **Upload path**: Studio WebView → postMessage → native `react-native-tcp-socket` → TV d2d TCP protocol

## Prerequisites

- Node.js 18+
- Android SDK (`~/Library/Android/sdk` or set `ANDROID_HOME`)
- Java 17 (for Gradle builds)

## Build

```bash
# Install dependencies
npm install

# Generate native Android project + build APK
npm run build

# Or step by step:
npm run prebuild          # Generate android/ from Expo config
npm run build:apk         # Gradle assembleRelease

# APK output:
# android/app/build/outputs/apk/release/app-release.apk
```

## Local development

```bash
npm start                 # Expo dev server
npm run android           # Run on connected device/emulator
```

## Key files

- `App.tsx` — entire app (screens, TV bridge, WebView bridge, scanning)
- `app.json` — Expo configuration (package name, plugins, EAS project ID)
- `eas.json` — EAS Build configuration (for cloud builds, optional)

## Notes

- `usesCleartextTraffic: true` is required for HTTP connections to TV port 8001
- The WebView loads the cloud Studio page with `?app=true` to trigger native bridge mode
- Native TCP upload uses `react-native-tcp-socket` for the Samsung d2d protocol
- Subnet detection uses a TCP socket to 8.8.8.8:53 to find the phone's local IP
