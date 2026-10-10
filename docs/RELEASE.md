# Release path

Web first, stores after the port gate (SPEC.md "Offline web app and release path").

## 1. Web (installable, offline)

- `pnpm build` → `packages/client/dist` (static). Host on any static host (Cloudflare Pages,
  Netlify, GitHub Pages, Vercel): no server code in v1. The build prints gzipped sizes and fails
  if the app shell (index.html, CSS and every script index.html loads) exceeds 300 kB; the
  three.js 3D chunk loads lazily and is listed apart.
- Level packs: the build copies `levels/packs/**` to `dist/levels/packs/**` and writes
  `dist/levels/packs/index.json` (`{ "packs": [...] }`); the dev server serves the same paths.
  The client lists golden levels, then each pack whose `engineVersion`/`contentVersion` match the
  running sim. The service worker precaches the shell (including the 3D chunk), fetches
  `index.json`/`pack.json` network-first and level files cache-first (`fo-levels`); when online the
  client prefetches the 30 levels after the player's current one and Settings/Levels show
  "N levels ready offline".
- `privacy.html` ships at the web root: its URL is the store privacy-policy URL.
- Updates: a new service worker installs in the background and activates between levels; after the
  reload a toast offers "Continue level N".
- Dev on a phone: `pnpm dev` (0.0.0.0:5180), open `http://<pc-lan-ip>:5180` on the phone,
  Add to Home Screen. iOS requires https for a service worker except on localhost: for LAN
  testing use `vite --https` with a local cert or tunnel, or test install on the hosted build.

## 2. Port gate (all must hold)

- [ ] ≥ 20 cached levels play start to finish in airplane mode on a mid-range iPhone at 60 fps (2D) / 30 fps (3D).
- [ ] Save survives a cleared cache (export/import in v1; server sync later).
- [ ] Playtest retention target met.
- [ ] Bot regression suite: no stalls or infeasible levels in any shipped pack.

## 3. Capacitor wrap (done in the repo; no game code changes)

Already in place: `@capacitor/{core,cli,ios,android,haptics,app,preferences,status-bar}` (root
devDependencies), `capacitor.config.ts` (app id `com.module12.farthestoutpost`, name and background
colour from the skin, `webDir: packages/client/dist`, iOS `contentInset: never` because the shell
pads with `env(safe-area-inset-*)`), and the native projects `ios/` and `android/` from
`npx cap add`. Portrait-only is set in `Info.plist` and `AndroidManifest.xml`;
`ITSAppUsesNonExemptEncryption` is false; `ios/App/App/PrivacyInfo.xcprivacy` is written.

The client's platform layer (`packages/client/src/platform.ts`) switches on
`Capacitor.isNativePlatform()`: haptics via `@capacitor/haptics` (else `navigator.vibrate`), the
save mirrored to `@capacitor/preferences` (restored if the web view purges IndexedDB), app
pause/resume (`@capacitor/app`) pauses the loop, input and audio, and the status bar is styled
from the skin. The plugins are dynamic imports, so the web shell never loads them.

Every release:

```
pnpm build                                   # web build into packages/client/dist
pnpm --filter @fo/client store-assets        # icon-1024.png + splash-2732.png into packages/client/store
npx cap sync                                 # copy dist + plugins into ios/ and android/
npx cap open android                         # Android Studio: build / run / bundle
npx cap open ios                             # on a Mac: Xcode
```

Icons and splash per density: on a Mac (or anywhere with network), `npx @capacitor/assets generate
--assetPath packages/client/store` turns the 1024 icon and 2732 splash into every iOS/Android size
(rename to `icon.png` / `splash.png` first, or pass `--iconBackgroundColor #3a2219`).

## 4. Apple: what needs Doug

- **Apple Developer Program** membership ($99/yr) on the Module12 account, and the bundle id
  `com.module12.farthestoutpost` registered.
- **A Mac with Xcode 26** (iOS 26 SDK) or **Xcode Cloud** (25 h/month included): `cd ios/App &&
  pod install` (CocoaPods is not available on Windows, so `cap add ios` skipped it), open
  `App.xcworkspace`, set the team for signing, drag `PrivacyInfo.xcprivacy` into the App target
  (it is on disk but not yet in the Xcode project), set version/build numbers.
- App Store Connect: create the app, paste `docs/STORE-LISTING.md` (name, subtitle, keywords,
  description, age rating, privacy answers), privacy-policy URL = hosted `privacy.html`, support
  URL, screenshots per device class, then TestFlight internal → external (Beta App Review) → submit.
- Replace the placeholder contact `privacy@module12.com` in `privacy.html` if that mailbox is not real.

## 5. Google Play

$25 one-time (needs Doug's Google Play Console account). `npx cap open android`, build a signed
App Bundle (upload key created in Android Studio; enrol in Play App Signing), internal testing
track first. Data safety answers are in `docs/STORE-LISTING.md`.

## 6. Store listing checklist

- [x] Name, subtitle, keywords; description written in the skin's voice (`docs/STORE-LISTING.md`).
- [x] Icon 1024×1024 and splash 2732×2732 (`store-assets` script, from the skin palette); [ ] screenshots per device class (portrait).
- [ ] 15–30 s preview video (the ad look is the pitch).
- [x] Privacy policy page (`packages/client/public/privacy.html`, hosted with the web build).
- [ ] Support URL and contact.
- [ ] Original names, art and themes only: mechanics may resemble the genre, branding must not.
