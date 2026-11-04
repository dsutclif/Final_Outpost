# Sizes in real metres

One table for every size the story levels, live scenes and films use, so they stay consistent (Doug, 2026-11-04).
1 m = 28 world units (`ART_M`) everywhere. When a size changes, change it here first, then in the data that uses it.

## People and vehicles

| Thing | Size | Where it is set |
|---|---|---|
| Crew, traders, Sela | 1.8 m tall | characters.ts `PERSON_M`, meshy.json `height` |
| Commander, ranger | 1.98 m tall | characters.ts (Doug's Scale tab, 958308e) |
| Raider warlord | 2.7 m tall | characters.ts |
| Sela's buggy | 2.64 m long | the 4.4 m build × 0.6 (livescene.ts `selaArrival`, sandbox Scale tab) |
| Halcyon chip | 6 cm across (read on a phone; a real coin is ~3 cm) | livescene.ts `chipHandoff` |

## The crash site (Doug, 2026-11-04, sandbox Crash site view)

| Thing | Size | Notes |
|---|---|---|
| Halcyon wreck | 27 m long | today's levels: 50 m. Ship/commander about 13.6 (the old film: 52.6) |
| Stasis pod (crash-site decor and films) | 2.66 m long, 1.44 m tall | today's levels: 3.32 m. The playable towable pods (`capture.recruit_container*`) keep their own size: they don't have to match. |
| Pod in the sand | base 0.80 m below the sand, 56% buried | the commander lies just above the sand inside it |
| Concrete pad (deck plates) | none | the pods sink into sand |

## The camera

| Thing | Size | Notes |
|---|---|---|
| Phone screen at play zoom | about 6 m across at the look point (170 units, look.json `viewW.default`) | portrait; the tilted view sees wider ground above the look point |
| Commander on screen | about 13% of the screen's height | |

## Layout of levels 1-5 (Doug's sketch, 2026-11-04)

The pods and the commander's landing spot are on the wreck's south side, and the first screen opens there. The
settlement is one to two screens to the south-west. The ridge is the eastern edge, running north to south past the
ship's tail. The flight recorder lies at the ship's east end, by the ridge.

Not applied yet: the levels and the opening film still use the old sizes. The re-layout places the crash site from
this table, and the film's set is rebuilt from the game's placements (the game leads; the film follows).
