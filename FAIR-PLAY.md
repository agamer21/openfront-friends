# Fair-play protections

- There is no admin button or transport event. The engine recognizes old resource-grant packet types only to ignore them safely; hosts cannot use that path either.
- Room starts are normalized to multiplayer. Host-only cheats, infinite gold/troops, instant build and gold multipliers are neutralized. Starting-gold presets remain bounded and apply through the normal rules.
- Incoming actions are schema-checked and stamped with the authenticated source player's client ID, replacing any claimed ID. Extra fields cannot write gold or other state. Malformed JSON and privileged/internal command types are discarded.
- Ordered turns are validated against the participant roster and gameplay action schemas. Invalid turns fail the match instead of being applied differently by different peers. Per-player input bursts and pending queues are bounded.
- Existing database rules restrict each player to their own input path and preserve immutable turn records. Hash comparisons continue to detect diverging simulations. The room protocol was bumped so older admin-enabled clients cannot join new rooms.

These are concrete protections for the current peer-hosted architecture, not a guarantee against every modified client. The host still orders turns and can withhold, omit or forge otherwise valid actions; local clients and local save files cannot be made authoritative by browser checks. Complete protection against a malicious host requires a trusted authoritative simulation service (or a separately designed authenticated consensus protocol). No such server has been deployed or claimed here.

Verification covers engine denial of old grants, poisoned room configuration, malformed/non-finite actions, sender-ID replacement, invalid turns and flood limits. Two real authenticated browser clients additionally submitted malicious packets through Firebase, checked denial of cross-player writes, continued simulation without resource grants, and exchanged chat. This is separate from HUD geometry/visual checks. Use fresh rooms after refreshing all participants; existing site storage is retained.

## Published verification

Code release 832c0d7 deployed successfully in Pages run 42290698928. Live Chrome repeated all six HUD viewport checks, open/closed Tools with nested panels expanded, adjacent build-button spacing, absent admin UI, no horizontal overflow and no JavaScript page errors. A live two-authenticated-client run again ignored direct forged grant/config/malformed packets, rejected cross-player input writes, continued simulation and delivered chat in Tools. Temporary test accounts and known room records were removed. The duplicate protection toast and large start banner were removed; the top status bar remains the countdown. Mobile builds use a readable horizontal scroll row.

The security boundary above remains: this has not deployed an authoritative match server or made a malicious peer host fully trustworthy. Refresh every participant and start new rooms for the updated protocol. Existing site storage was retained.
