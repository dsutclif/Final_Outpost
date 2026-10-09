# Release path

Web first, stores after the port gate (SPEC.md "Offline web app and release path").

## 1. Web (installable, offline)

- `pnpm build` → `packages/client/dist` (static). Host on any static host (Cloudflare Pages,
  Netlify, GitHub Pages, Vercel): no server code in v1.
- Level packs live under `dist/levels/packs/`; the service worker precaches the shell and
  runtime-caches packs; the client prefetches the next 20–50 levels when online.
- Dev on a phone: `pnpm dev` (0.0.0.0:5180), open `http://<pc-lan-ip>:5180` on the phone,
  Add to Home Screen. iOS requires https for a service worker except on localhost: for LAN
  testing use `vite --https` with a local cert or tunnel, or test install on the hosted build.

## 2. Port gate (all must hold)

- [ ] ≥ 20 cached levels play start to finish in airplane mode on a mid-range iPhone at 60 fps (2D) / 30 fps (3D).
- [ ] Save survives a cleared cache (export/import in v1; server sync later).
- [ ] Playtest retention target met.
- [ ] Bot regression suite: no stalls or infeasible levels in any shipped pack.

## 3. Capacitor wrap (no game code changes)

```
pnpm add -D @capacitor/cli @capacitor/core @capacitor/ios @capacitor/android
npx cap init "Farthest Outpost" com.module12.farthestoutpost --web-dir packages/client/dist
npx cap add ios && npx cap add android
pnpm build && npx cap sync
```

Native swaps via plugins: `@capacitor/preferences` or SQLite for saves, `@capacitor/haptics`,
`@capacitor/app` (pause on background), `@capacitor/status-bar`, safe-area CSS already in the
shell. Audio interruption handling via the `App` plugin `pause`/`resume` events.

## 4. Apple

Needs a Mac with Xcode 26 / iOS 26 SDK and an Apple Developer Program membership ($99/yr),
or Xcode Cloud (25 h/month included). Steps: bundle id, signing in CI, automatic build
numbers, privacy manifest (`PrivacyInfo.xcprivacy`: no tracking; telemetry = app functionality,
not linked to identity), export-compliance flag (no non-exempt encryption), age rating
questionnaire (no objectionable content, mild cartoon violence), privacy policy URL,
TestFlight internal → external (Beta App Review) → App Store submission.

## 5. Google Play

$25 one-time. Android Studio build from the Capacitor project; same privacy disclosures
(Data safety form).

## 6. Store listing checklist

- [ ] Name, subtitle, keywords; description written in the skin's voice.
- [ ] Icon 1024×1024 (from the skin's icon source), screenshots per device class (portrait).
- [ ] 15–30 s preview video (the ad look is the pitch).
- [ ] Privacy policy page (static, hosted with the web build).
- [ ] Support URL and contact.
- [ ] Original names, art and themes only: mechanics may resemble the genre, branding must not.
