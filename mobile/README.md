# How We Feel — Mobile

Expo / React Native app for iOS + Android. This README covers running the
app locally on the iOS simulator.

## Prerequisites

- **Node 20+** (`node --version`)
- **Xcode 15+** with iOS Simulator installed (Xcode → Settings → Components)
- **CocoaPods** (`gem install cocoapods` or `brew install cocoapods`)
- **macOS** (iOS builds require Xcode)

## First-time setup

From the **repo root** (not `mobile/`):

```bash
npm install
```

This installs dependencies for both `mobile/` and `shared/` workspaces in one
pass — `package.json` declares them under `"workspaces"`.

## Running on iOS simulator

There are two paths depending on what you're doing.

### First run, or after any native change

A native change is anything that touches `mobile/app.json`, adds/removes a
package with native code, bumps Expo SDK, or modifies the iOS project files.

```bash
cd mobile
npx expo prebuild --clean    # Regenerate ios/ from app.json
npx expo run:ios             # Build the dev client and launch the simulator
```

The first build takes 5–10 minutes (CocoaPods + Xcode compile). Subsequent
runs are much faster.

### JS-only iteration (after the dev client is installed)

Once `expo run:ios` has installed the dev client on the simulator, you can
restart Metro without rebuilding:

```bash
cd mobile
npx expo start
# Press 'i' to open the simulator
```

Edits to `.ts` / `.tsx` hot-reload. If you change a native dep or `app.json`,
go back to the prebuild + run path above.

## Why Expo Go does not work

`mobile/app.json` sets `"newArchEnabled": true` (React Native New Architecture).
Expo Go ships with the old architecture, so the bundle will fail to load
there. You need the dev client built by `expo run:ios`.

## Mock mode (no backend required)

Set `EXPO_PUBLIC_MOCK_MODE=true` to seed the app with fixture data on launch:

```bash
cd mobile
EXPO_PUBLIC_MOCK_MODE=true npx expo start
```

The fixtures live in `mobile/src/mocks/fixtures.ts` (`MOCK_LOGS` and friends).
Stores in `mobile/src/store/` read the env var on init and pre-load the
fixtures so the home, journal, and insights screens render with content.

## Common errors

### `Tried to register two views with the same name RNCSafeAreaProvider`

The `mobile/` workspace and the repo root both end up with copies of native
modules (`react-native-safe-area-context`, `react-native-screens`). Metro
sees both and registers each native view twice.

`mobile/metro.config.js` already pins the resolver to `mobile/node_modules/`
first, which avoids the duplicate registration. If you still hit this error:

1. Confirm `mobile/metro.config.js` is present and unmodified.
2. `rm -rf node_modules mobile/node_modules && npm install` from the repo root.
3. `cd mobile && npx expo prebuild --clean && npx expo run:ios`.

A follow-up fix that dedupes the offending versions in `mobile/package.json`
is tracked in `hwf-0xx2`.

### `Unable to resolve module howwefeel-kyle-shared`

Run `npm install` from the **repo root**, not from `mobile/`. The shared
package is a workspace; installing inside `mobile/` alone won't link it.

### Pod install fails on `expo run:ios`

```bash
cd mobile/ios
pod deintegrate
pod install
```

Then retry `npx expo run:ios` from `mobile/`.

## Useful scripts

From `mobile/`:

| Command | Purpose |
|---------|---------|
| `npx expo start` | Metro bundler (JS iteration) |
| `npx expo run:ios` | Build + launch dev client on iOS simulator |
| `npx expo prebuild --clean` | Regenerate `ios/` from `app.json` |
| `npm test` | Jest unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint via `expo lint` |
