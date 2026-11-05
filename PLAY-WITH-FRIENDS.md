# Play OpenFront Friends

Play at https://agames21.github.io/openfront-friends/ .

## Online matchmaking

1. Click **Multiplayer**.
2. Sign in with Google, or create/sign in to an email and password account.
3. Open **Quick play & classic servers**, then click **Find multiplayer match**. Keep the tab open.
4. If another commander joins within 20 seconds, both players share the same world with AI nations. If nobody joins, the game clearly switches to **Normal AI**.

Online games currently support two humans plus AI, on the compact World map, with Normal difficulty and five-minute border protection. Queue cancellation is available. Your account stays signed in across reloads; use Sign out on a shared device. Password recovery is available in the account panel.

Matches are casual and peer-hosted: the first player's browser orders turns and both browsers simulate them. If either player leaves, the remaining player continues the same world locally. The departing nation is marked disconnected; there is no kick or match reset. A network outage also switches the survivor to local play after a grace period. A desync still shows an error rather than silently merging different worlds. Use the separate Play with friends rooms below for reconnecting. Large public lobbies, ranked play, and dedicated-server anti-cheat are not implemented.

## Hosting and maintenance

GitHub Pages hosts the game. Firebase project `ag-arcade-frontier` uses the free Spark plan for Authentication and Realtime Database; no billing account was linked. Provider settings and authorized domains are configured for AGames21.github.io. `src/client/FriendsFirebase.ts` contains only the public Firebase web configuration. OAuth authorization codes, refresh tokens, Google client secrets, and service-account credentials must never be committed.

Database rules in `database.rules.json` require authentication, restrict room data to its members, reserve host turn writes for the host, and restrict inputs/acknowledgements to their owner. They are deployed with `firebase deploy --only database --project ag-arcade-frontier`. Quota exhaustion stops online service; solo remains available. No automatic paid upgrade is configured. Abandoned host sessions can leave room history behind; periodically remove old closed rooms in the Firebase console. Turn writes expire after two hours.

## Optional LAN server

For the original full Node server and larger private lobbies, run `npm run friends` locally and share its LAN address with friends on the same network. The GitHub Pages multiplayer button uses Firebase matchmaking instead of this server.

## Saved worlds and the AG Arcade edition

Games open in the same tab. The top-left AG Arcade button saves the current world before returning to the library. The upstream store, inventory, clan, online leaderboard, and Steam purchase menus are hidden in this edition; source credits remain.

Worlds autosave every ten seconds in IndexedDB, separately for a signed-in account or guest on this browser. Continue saved world restores the last complete snapshot. An online world resumes as a local continuation, not a rejoin to an old room. Keep browser site data; private browsing, clearing storage, a different browser/device, or an incompatible future save format can prevent continuation. This is local-device saving, not cloud synchronization. Retro Bowl uses its existing browser career saves; the arcade wrapper preserves their origin and storage.

All AI levels were eased: nation capacity multipliers Easy/Normal/Hard/Extreme are 0.30/0.45/0.65/0.85; growth multipliers are 0.65/0.75/0.85/0.95; attack intervals are 100-145/85-120/70-100/55-85 ticks. Human stats remain unchanged. Tribes use one-quarter base capacity and a 0.35 growth multiplier.

## Quit and save-backup navigation

The in-game Exit to menu button and settings exit return to /openfront-friends/, not the AG Arcade root. A snapshot flush runs before leaving. The separate AG Arcade back link intentionally returns to the library. AG Arcade now exports/restores the current account/guest world through Save backups; sign-in credentials are excluded. Private tank rooms use a separate tankRooms namespace and isolated anonymous sessions; see the arcade repository MULTIPLAYER-AND-SAVES.md.

## Your public display name

After signing in with Google or email, choose and save a display name in the Multiplayer panel. It is stored in your own Firebase game profile and used for new matches and AI fallbacks. Names use 2-20 letters, digits, spaces, underscores or hyphens; extra whitespace is normalized. The name can be changed later in the same panel. Your Google account name is not changed or automatically published as the match name. Profile data is private to its owner; the chosen name is shared with players through the match roster.

## Reconnectable 1v1 / 2v2 rooms and map voting

In Multiplayer, sign in, save a display name, then use **Play with friends**.
Choose 1v1 or 2v2, create a room, and share its code. Each player needs a different
account. The first two slots are Team 1 and the last two are Team 2 in 2v2.
Once all players join, everyone has 20 seconds to vote for World, Europe or
North America. Most votes wins; a tie uses the host's vote if it is tied, then the
listed map order. The match launches automatically when voting closes.

These new rooms retain the committed turn history. A dropped player pauses the
shared timeline; an open tab reconnects automatically. After refreshing, use
**Rejoin last match** in Multiplayer on the same account and browser to replay
and return to the same nation. Replay time grows with match length. The host
must return before play can resume; host migration is not included. Rooms have
an approximately two-hour write/rejoin window under the existing database rules.
A lobby closes after five minutes without all players, or if someone leaves
before launch. Create a new code in that case.

Quick play and the original public/private server browser keep their previous
behavior. Use the new Play with friends room options for reconnect and map voting.
Chat supports every player in a new room. These rooms reuse existing member-only
Firebase paths and do not require changing deployed database rules.

## Missions, aircraft and the new home

The home screen groups play into **Solo**, **Multiplayer**, and **Missions**.
The difficulty selector applies to newly started solo games and missions.
Continue restores your most recent saved world, including an unfinished mission.
Chat and notifications remain in the bottom-left panel.

Open **Missions** for these objectives:

- **Co-op survival:** 60 seconds to prepare, then ten escalating AI waves.
- **Capture points:** hold two of three marked beacons to accumulate 180 control seconds. Each held beacon also supplies 25,000 gold and 2,000 troops every ten seconds. Team members share objective score in 2v2.
- **Iron Dome challenge:** protect your command city through eight increasingly dense missile waves, or destroy the enemy launch sites. A starting Iron Dome and extra funds help you prepare.
- **Operation Lifeline:** reach the stranded ally and maintain your nearby presence for 30 seconds while keeping its command city alive.
- **Island defense:** protect your command city through six naval invasions.
- **Fortress assault:** capture or destroy an enemy command city protected by defense posts, an Iron Dome, and an airfield.

Survival and capture points support **Play with friends**, using the existing
reconnectable rooms and map vote. Choose the activity before creating a room.
Survival puts every human on the same team, with troop and gold donations;
capture points supports 1v1 or 2v2. The four story challenges start solo with a
prepared base. Survival and capture points let players pick their starting tile.

New games enable **Airfields** in the Build menu and build bar. An airfield costs
750,000 gold initially, takes ten seconds to build, and automatically sends one
aircraft at a time at nearby enemy targets (220 map tiles, a 30-second launch
interval). Aircraft raid enemy troop reserves and damage nearby warships, then
return; they do not capture territory. Enemy Iron Domes spend ammunition to
intercept them. Expanding AI nations can build airfields too.

Mission counters, aircraft sorties and objectives are saved in snapshots and
replayed deterministically in room matches. Existing saved worlds keep their
original rules. Older active online-room histories use a different version;
start a fresh room after this update so everyone runs the same simulation.

## Aircraft cleanup fix - 2026-11-05

Fixed a crash when an already-destroyed aircraft was cleaned up after losing its airfield. Cleanup now checks whether the aircraft is active and clears the cached reference. Regression tests cover both removed and still-active aircraft during airfield destruction; the 15 mission/aircraft tests pass. Refresh all participating clients after deployment to load the corrected simulation worker.

## Team tools, room settings, results and recovery - 2026-11-05

- Open **Team & diplomacy** above the right-hand dock. Choose Attack here, Defend here or Need help, then click/tap the map; Escape cancels. Markers expire after ten seconds. In a room they use authenticated chat delivery; other players see only friendly/team pings. Solo markers stay local. This is a casual peer-hosted room, not an encrypted team communications service.
- Select a nation to offer a temporary pact (the existing alliance acceptance/expiry rules), send 10,000 gold, send 10% of troops, or request support in room chat. Transfers require a living ally, sufficient resources, enabled donations and engine cooldowns. These are gifts/support transfers, not an atomic two-sided trading marketplace. New Play with friends rooms enable donations. Existing classic rooms and saved worlds retain their prior donation rules.
- Before creating a **Play with friends** room, choose a voted/fixed map, AI difficulty, starting gold (50,000/500,000/2,000,000), aircraft and nuclear availability. Choices are fixed in the host metadata and applied to the shared game start; joining players see the settings summary. Classic Quick Play/server creation keeps its existing preset.
- Eliminated players can use the existing Spectate button and select a surviving nation in the Team & diplomacy panel to center the camera. The simulation/relay stays connected. There is no new spectator slot for unregistered outsiders, and host-disconnect pause rules still apply.
- Final results add human eliminations, peak territory, units destroyed and aircraft lost. Match standout uses the displayed formula: peak territory + 1,000 per human elimination + 100 per unit destroyed. It is a transparent game score, not a claim about skill or team causality.
- Autosave now retains the last two completed checkpoints per account/guest in IndexedDB. Crash dialogs offer the latest safe save or previous checkpoint, each timestamped. Recovery continues locally; use Multiplayer/Rejoin for the shared online timeline. A crashed worker's failed snapshot does not replace a completed save. Storage clearing and incompatible future snapshots can still prevent recovery.

Checks: 21 targeted feature, party/reconnect, chat and control tests passed. A real-browser IndexedDB check confirmed two-checkpoint rotation, preservation after a failed snapshot, and dispatching the selected recovery checkpoint. That storage check uses bounded fixture bytes and does not claim a full resumed simulation. No exhaustive multiplayer battles, end-to-end pact negotiation or full live-room crash recovery were run for this release.

## Hosting origin correction - 2026-11-05

Pages builds derive map/image/worker CDN_BASE from GITHUB_REPOSITORY owner; PAGES_ORIGIN remains an explicit override. Local builds default to https://agamer21.github.io . This fixes missing World thumbnails and solo map.bin/map4x.bin fetch failures after moving the site. Brief browser check loaded an actual World thumbnail and started a solo simulation past five ticks with no old-domain requests or error modal. Refresh existing tabs after deployment.
