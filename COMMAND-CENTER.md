# Command center: current behavior

Host controls and the white dot were removed at the owner's request. Legacy grant packets are inert in the engine, including solo and replays. Multiplayer input and ordered turns are validated; player identity comes from the authenticated input path. Unsupported control/resource packets, malformed actions and input floods are rejected. Room starts cannot claim solo mode or carry host/infinite-resource privileges. See FAIR-PLAY.md for scope and security limits.

In-game chat, diplomacy, Field Guide and the arcade link are grouped under Tools. The drawer and tutorial reserve measured space above the battle dock. The leaderboard is below the world-status bar on compact screens; optional hints and leaderboard hide while the compact Tools drawer is open. Unit build targets are at least 44px high on mobile. Notifications have a bounded scroll area.

Validation: 35 targeted tests, production build/TypeScript and scoped lint passed. Isolated Chrome checked six viewport sizes (1440×900, 1024×900, 768×900, 390×844, 320×640, 1024×600), with Tools closed/open and all nested tools expanded. The visible leaderboard aside is included in collision checks, not merely its wrapper. No tested HUD frame overlaps or horizontal document overflow remained. Two actual authenticated browsers over real Firebase rejected forged grant/config/malformed inputs, denied cross-player writes, advanced the shared simulation and exchanged chat after drawer relocation. Temporary accounts and known rooms were removed. Physical mobile keyboards, every contextual popup, 2v2 and full matches were not exhaustively checked.

## Historical implementation and validation notes

The records below describe earlier versions. Their host-control availability and old verification limits are superseded by the current behavior above.

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

### Post-release validation

The earlier network-testing limitation is now superseded for 1v1. Two authenticated browser clients over real Firebase, including a live-site run, created a fixed-World private room and spawned both players through the existing spawn-intent path. Only the host had the dot. A million-gold grant appeared on the guest, infinite troops synchronized, and the simulation advanced another 30 ticks without an error modal. Temporary test accounts/profiles and known room records were removed. Full-match/endgame and 2v2 admin use remain untested.

Final checks: 31 tests across six files, production build/TypeScript, targeted lint, live desktop/320/390 menus, solo/settings/help, solo admin actions and real Google popup passed. All players should refresh and create a new room. Final code deployment: 904b153, successful Pages run 42284171141. No overall FPS gain or complete game audit is claimed.


## Four-player reconnects and rematch

The host can choose **Rematch with same settings** in Play with friends after leaving a match. The lobby creates a fresh room code and carries over the previous map, match type, mode, difficulty, starting gold and weapon options. Friends join with the new code. When the previous match used map voting, the rematch uses the map the group played.

Multiplayer relay errors offer **Copy error details** with the message, match ID, next turn and build version. When clipboard access fails, the dialog shows selectable text. Saved and incoming party turns share the same validation before the game applies them.

Four authenticated Chrome clients played a complete 2v2 Capture Points match on Europe over real Firebase. Closing and reopening a guest tab and then the host tab paused the match and resumed all four clients through Rejoin last match. All four reached the results screen. A follow-up on the final local build verified both reconnects, new room settings, an induced desync, the copied report and the manual clipboard fallback. Production build, TypeScript, scoped lint and 36 focused tests passed. Temporary test accounts and known rooms were removed.
