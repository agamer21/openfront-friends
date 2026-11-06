# Command-center update

- New responsive command-center home screen, illustrated globe, original SVG icons, and four campaign cards.
- Easy / Normal / Hard / Extreme map to the engine's Easy / Medium / Hard / Impossible AI. Selection is remembered and applied when solo setup opens. Advanced setup remains available.
- Five original synthesized WAV cues replace the interface click, hover/slider, match launch, spawn, and conquest sounds. They use the existing mixer, master mute, and category-volume controls. The launch-sound test enables sound explicitly; browsers still require a user gesture for audio.
- Added an in-game Field Guide with icons and descriptions for cities, factories, defense posts, ports, warships, and missile silos. It explains the existing Build menu.
- All new icons are code-native SVGs. New `friends-*.wav` assets are original and follow the resources directory's CC BY-SA 4.0 license. Existing upstream copyright and asset notices remain.
- User-provided RoWorld menu and HUD screenshots guided the navy/gold palette, prominent play button, map backdrop, live world-control panel, and wide bottom battle dock. No Roblox assets were extracted.
- GitHub Pages continues to host solo play. Internet multiplayer still requires a separate server.

- Added a live top-center world-control panel with real territory share, leader, rank, configurable victory target, match timer, and border-protection countdown when active.
- Desktop bottom dock now combines nation identity, troops, attack strength, gold, building icons, hotkeys, and real costs. Quick 10/25/35/50/75% buttons use the existing attack-ratio controller; the slider still works.
- New solo matches offer five minutes of actual engine border protection, enabled by default with a setup checkbox to disable it. Tutorial and saved-game configurations are preserved.

## Verification

Production build and TypeScript passed. 158 tests passed across 11 files covering audio mixing, solo configuration, unit display, and attack-ratio controls. In Chrome: all four preset cards applied the expected engine difficulty; a synthesized launch cue played as non-silent audio in a running AudioContext; mute suppressed selection playback; the 25% button updated the live attack ratio; protection could be disabled in setup and enabled for a match; the victory target displayed 80%; and the bottom dock measured 1,400px wide at a 1,440px viewport. A solo match started and progressed with the Field Guide open. Desktop and 390px mobile layouts were checked with no horizontal overflow. No JavaScript page errors or missing game assets were observed. Physical speaker listening and a full-match victory were not verified.


## 2026-11-02: accounts, matchmaking, and gentler Normal

The new Pages multiplayer flow uses Firebase Authentication (email/password and Google) and Realtime Database on Spark. See PLAY-WITH-FRIENDS.md for current behavior and limits; it supersedes earlier static-only multiplayer notes. Normal nation army capacity is now 65% of the base (previously 75%), growth multiplier 0.92 (previously 0.95), and attack reactions 62-80 ticks (previously 55-70). Human stats and other difficulty levels are unchanged.

Validation: full TypeScript workspace checks and Pages build passed; 77 relevant unit tests passed. The browser Normal playthrough verified all difficulty selections, audio playback/muting, protected start, world-control progress, bottom HUD, attack ratio, field guide, and mobile overflow. Two real Firebase test accounts joined from isolated browsers, both sent actions, and game hashes matched at turns 0 and 100. Simultaneous queue entry, cancellation, and a 20-second fallback to a real Singleplayer/Medium game passed. Rules rejected anonymous room reads and guest writes to host turns. Temporary accounts and test rooms were removed. Google provider verification and live deployment results are recorded below when complete.


## 2026-11-02: accounts, matchmaking, and gentler Normal

The new Pages multiplayer flow uses Firebase Authentication (email/password and Google) and Realtime Database on Spark. See PLAY-WITH-FRIENDS.md for current behavior and limits; it supersedes earlier static-only multiplayer notes. Normal nation army capacity is now 65% of the base (previously 75%), growth multiplier 0.92 (previously 0.95), and attack reactions 62-80 ticks (previously 55-70). Human stats and other difficulty levels are unchanged.

Validation: full TypeScript workspace checks and Pages build passed; 77 relevant unit tests passed. The browser Normal playthrough verified all difficulty selections, audio playback/muting, protected start, world-control progress, bottom HUD, attack ratio, field guide, and mobile overflow. Two real Firebase test accounts joined from isolated browsers, both sent actions, and game hashes matched at turns 0 and 100. Simultaneous queue entry, cancellation, and a 20-second fallback to a real Singleplayer/Medium game passed. Rules rejected anonymous room reads and guest writes to host turns. Temporary accounts and test rooms were removed. Google provider verification and live deployment results are recorded below when complete.

Google provider is enabled with a generated web OAuth client. A browser test opened the real Google sign-in page; completing a personal Google account sign-in was not automated. Live email account creation, sign-in, session persistence, simultaneous pairing, matching state hashes, cancellation and Normal AI fallback all passed. The relay allows a maximum three-turn pipeline to absorb network latency while preserving turn order.


## 2026-11-06 menu and HUD refresh

Home now emphasizes Play Solo, with separate Multiplayer and Missions cards, active Play/Missions navigation, a quick-controls guide and remembered difficulty. Navy surfaces, green status text and gold actions carry through to the live world-control panel and two-row desktop resource/build dock. Mobile menus retain stacked cards and native game controls. Menu chat participates in document flow to avoid covering cards; desktop match chat sits above the dock.

World-status polling skips hidden tabs and unchanged simulation ticks. Its game/tick cache resets when leaving gameplay, so a replacement game is always refreshed. This reduces redundant HUD work; it is not an overall FPS benchmark. Mission HUD uses an opaque surface instead of filtering the moving map.

Validation: production Pages build/TypeScript passed; eight targeted tests passed, including world-status pause/visibility/cache regression. Targeted lint passed. Isolated Chrome against locally built artifacts verified navigation, missions, guide, chat positioning, 320/390 menus, a real solo World simulation, the 25% attack action, desktop dock geometry and 390 gameplay without horizontal document overflow or JS page errors. Full matches, multiplayer and sustained FPS are untested. Owner authorized push/publication on 2026-11-06. Release deployment and live validation are recorded in the project vault.

## Hosted account sign-in fix (2026-11-06)
Hosted provider entry points now use Firebase instead of the original server OAuth API. Solo setup says Multiplayer account rather than promising unsupported official achievements. The account panel explains local solo saves and achievement limits. Production build and 16 focused tests passed; isolated Chrome opened the real Google login popup without localhost navigation. Personal Google sign-in was not completed. Unrelated upstream cosmetics requests to localhost remain a follow-up issue.


## Menu system refresh (2026-11-06)
Unified navy modal surfaces, consistent headers and tabs across solo/settings/help, redesigned Google/email account screen, separate friends-room and public-match sections, responsive room settings and readable input targets. Multiplayer supports Escape, focus containment and focus restoration. Build and ten targeted tests passed. Chrome checked desktop/320/390 account layouts and solo/settings/help. Signed-in friends/server tabs were visual fixtures; no account or real room was created in these checks.


## Host resource controls (2026-11-06)

In new solo games and hosted casual private matches, a tiny white dot at bottom-right opens Host controls. Enter an amount (1 to 1 billion) for gold or troop grants, or enable/disable engine infinite gold and troops. Changes affect the host's own nation. Engine infinite troops raises capacity rather than using non-finite numbers; grants over normal capacity remain subject to normal population rules unless infinite troops is enabled. Gold's infinite mode makes host building costs free. Guests and public games are rejected in the worker, even if a command is submitted manually.

Commands travel as stamped simulation intents and execute in deterministic turn order on each peer. Host identity is established at game creation, and room protocol versions were advanced so older tabs cannot join new rooms. Refresh all players and create a new room; older saves without creator metadata retain their previous behavior. Snapshot restoration preserves granted resources and host settings.

Validation: production build/TypeScript and 30 tests passed, including two independent engine worlds, grants, authority checks, invalid values, enabled/disabled snapshot restoration, panel controls and cleanup, existing missions/aircraft and party behavior. Real Chrome against local artifacts verified the dot, a million-gold grant, infinite troops across advancing ticks, committed gold toggles and closing. Actual networked multiplayer admin play has not been completed. These changes do not claim a complete game audit or a measured FPS gain.

Hosted builds also skip the unavailable original cosmetics catalog request, using the same default fallback immediately instead of attempting localhost. Existing non-hosted catalog loading remains unchanged.
