# Store listing: Farthest Outpost (Mars Greenhouse)

Draft copy and questionnaire answers for App Store Connect and Google Play. Names and art are
original; mechanics resemble the survival-builder genre, branding does not.

## Identity

| Field | Value |
|---|---|
| App name (30 max) | Farthest Outpost: Mars Greenhouse |
| Home-screen name | Outpost |
| Subtitle (30 max) | Keep the reactor hot |
| Bundle / package id | com.module12.farthestoutpost |
| Category | Games → Strategy (secondary: Simulation) |
| Price | Free, no in-app purchases, no ads (v1) |
| Support URL | needs Doug (e.g. https://module12.com/outpost/support) |
| Privacy policy URL | `<web host>/privacy.html` (ships with the web build) |

## Keywords (iOS, 100 characters, comma-separated, no spaces)

```
colony,mars,survival,builder,base,reactor,greenhouse,outpost,offline,idle,strategy,tycoon,settlers
```

## Promotional text (170 max)

Dig ore, feed the reactor and grow a colony under glass. Dozens of hand-tested missions, all playable offline.

## Description

The farthest outpost on Mars runs on one thing: heat. Keep the reactor fed and the greenhouse
domes grow food, traders line up at your kiosk and new colonists arrive. Let it run dry and the
cold creeps in.

- Carry ore on your back, stock the kiosk and ring up traders at the register.
- Spend credits on build pads: hire haulers, clerks and technicians who work on their own.
- Tow stasis pods home through the airlock and wake new colonists in the reactor's warmth.
- Raise walls and turrets before the raiders and dust crawlers arrive.
- Ride out dust storms, run galleys and smelters, upgrade your reactor.
- Every mission is checked by a team of test bots, so every level is beatable.
- Plays fully offline once downloaded. No accounts, no ads, no tracking.

Low-poly 3D on capable phones, a crisp 2D mode for older ones.

## What's new (first release)

First launch of Farthest Outpost: Mars Greenhouse. Four story missions plus generated sectors,
star ratings, offline play and a choice of 3D or 2D graphics.

## Screenshots

Portrait, per device class: 6.9" iPhone (1320 × 2868), 6.5" (1284 × 2778), 13" iPad (2064 × 2752)
if iPad is enabled; Play: phone 1080 × 1920 minimum. Source frames: `docs/screenshots/client-3d-l1..l4.png`
(375 × 812 CSS px at 2x); capture final ones from a device or the simulator at native size.
Preview video 15–30 s: the ad loop (gather → reactor → kiosk coins → build pop → raid).

## Icon and splash

`pnpm --filter @fo/client store-assets` writes `packages/client/store/icon-1024.png` (opaque RGB,
App Store size) and `splash-2732.png` from the skin palette.

## Age rating (Apple questionnaire)

| Question | Answer |
|---|---|
| Cartoon or fantasy violence | Infrequent/Mild (turrets shoot raiders and creatures; no blood) |
| Realistic violence | None |
| Prolonged graphic or sadistic violence | None |
| Profanity or crude humour | None |
| Mature/suggestive themes | None |
| Horror/fear themes | None |
| Medical/treatment information | None (the med bay is a game building) |
| Alcohol, tobacco, drugs | None |
| Simulated gambling | None |
| Sexual content or nudity | None |
| Contests | None |
| Unrestricted web access | No |
| User-generated content / chat | No |
| Made for Kids | No (general audience) |

Expected result: 4+ (Apple), PEGI 7 / ESRB Everyone (IARC on Google Play, mild fantasy violence).

## App privacy (Apple "nutrition label")

- Data used to track you: **None**.
- Data linked to you: **None**.
- Data not linked to you: **None collected** in v1. Play records stay on the device and are only
  exported by the player as a file. If a later version posts telemetry (`VITE_TELEMETRY_URL`),
  declare "Gameplay content / Product interaction — App functionality, Analytics — not linked".
- `PrivacyInfo.xcprivacy`: no tracking, no collected types, UserDefaults reason CA92.1.
- Export compliance: uses no non-exempt encryption (`ITSAppUsesNonExemptEncryption = false`).

## Google Play data safety

| Question | Answer |
|---|---|
| Does the app collect or share any required user data types? | No |
| Is all user data encrypted in transit? | Yes (HTTPS for game files; no user data sent) |
| Can users request data deletion? | Yes: Reset progress in Settings, or uninstall |
| Ads | No |
| Target audience | 13+ recommended (avoids Families policy work); content is all-ages |
| Permissions | Vibrate only (haptics) |
