import { Difficulty } from "@openfront/engine-api/game/GameTypes";
import type { GameMapType } from "@openfront/engine-api/game/GameTypes";
import { generateID } from "@openfront/shared/SharedUtil";
import type { WireGameStartInfo } from "@openfront/shared/WireSchemas";
import {
  get,
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  set,
  update,
  type Unsubscribe,
} from "firebase/database";
import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { friendsDB } from "../FriendsFirebase";
import {
  choosePartyMap,
  memberRoom,
  PARTY_MAPS,
  PARTY_VERSION,
  partyControl,
  partyStart,
  readPartyResume,
  savePartyResume,
  type PartyInfo,
  type PartyMember,
} from "../FriendsParty";
import type { FriendsSession } from "../FriendsRelay";
import { roomSettings, type FriendsRoomSettings } from "../FriendsRoomSettings";
import "./friends-party.css";

@customElement("friends-party-lobby")
export class FriendsPartyLobby extends LitElement {
  @property() uid = "";
  @property() displayName = "";
  @property() activity: "standard" | "survival" | "capture" = "standard";
  @state() private code = "";
  @state() private settings = roomSettings(null);
  @state() private count = 4;
  @state() private members: PartyMember[] = [];
  @state() private votes: Record<string, string> = {};
  @state() private status = "";
  @state() private busy = false;
  @state() private deadline = 0;
  @state() private seconds = 0;
  private inputCode = "";
  private hostUID = "";
  private myRoom = "";
  private roomIDs: string[] = [];
  private off: Unsubscribe[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private started = false;
  private finishing = false;
  private disposed = false;
  connectedCallback() {
    super.connectedCallback();
    this.disposed = false;
  }
  createRenderRoot() {
    return this;
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.disposed = true;
    if (!this.started) void this.leave();
    else this.cleanup();
  }
  private cleanup() {
    this.off.splice(0).forEach((off) => off());
    clearInterval(this.timer);
  }
  private myMember(): PartyMember {
    return { uid: this.uid, clientID: generateID(), name: this.displayName };
  }
  private path(suffix: string, room = this.myRoom) {
    return ref(friendsDB, `rooms/${room}/${suffix}`);
  }
  private async action(fn: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    this.status = "";
    try {
      await fn();
    } catch {
      this.status =
        "Could not reach this room. Check the code and connection, then try again.";
    } finally {
      this.busy = false;
    }
  }
  private async create() {
    if (!this.displayName || !this.uid) return;
    await this.action(async () => {
      const me = this.myMember(),
        code = generateID();
      const ids = Array.from({ length: this.count - 1 }, (_, index) =>
        index === 0 ? code : `${code}_${index + 1}`,
      );
      const now = Date.now();
      const paths = Object.fromEntries(
        ids.map((room) => [
          `rooms/${room}/meta`,
          {
            host: me,
            createdAt: now,
            version: PARTY_VERSION,
            named: true,
            name: `${me.name}'s ${this.activity === "survival" ? "co-op" : this.count === 4 ? "2v2" : "1v1"} room`,
            partyCount: this.count,
            settings: this.settings,
            partyActivity: this.activity,
            roomIDs: ids,
          },
        ]),
      );
      await update(ref(friendsDB), paths);
      if (this.disposed) {
        await Promise.all(
          ids.map((room) => remove(ref(friendsDB, `rooms/${room}`))),
        );
        return;
      }
      this.code = code;
      this.roomIDs = ids;
      this.myRoom = ids[0];
      this.hostUID = this.uid;
      this.members = [me];
      this.started = false;
      for (const room of ids) await onDisconnect(this.path("", room)).remove();
      for (const [index, room] of ids.entries()) {
        this.off.push(
          onValue(this.path("guest", room), (snapshot) => {
            const member = snapshot.val() as PartyMember | null;
            // Keep the slots in creation order so pinned teams never shuffle.
            const slots = this.members.slice();
            if (member && member.uid !== "closed") slots[index + 1] = member;
            this.members = slots;
            const joined = this.members.filter(Boolean);
            if (
              new Set(joined.map((player) => player.uid)).size !== joined.length
            ) {
              this.status =
                "The same account joined twice. Create a new room with different accounts.";
              void this.leave(false);
              return;
            }
            if (
              this.members.filter(Boolean).length === this.count &&
              !this.deadline
            ) {
              this.deadline = Date.now() + 20000;
              this.status =
                "All players joined. Vote for a map — the match starts when voting closes.";
            }
            void this.broadcast();
          }),
        );
        this.off.push(
          onValue(this.path("closed", room), (snapshot) => {
            if (snapshot.exists() && !this.started) {
              this.status =
                "A player left this room. Create a new room to play.";
              void this.leave(false);
            }
          }),
        );
      }
      // Each guest writes only to their own existing input path.
      this.watchVotes();
      this.timer = setInterval(() => {
        this.seconds = Math.max(
          0,
          Math.ceil((this.deadline - Date.now()) / 1000),
        );
        if (this.deadline && this.seconds === 0 && !this.finishing)
          void this.finish();
        if (!this.deadline && Date.now() - now > 300000) {
          this.status = "This lobby expired. Create a new room.";
          void this.leave(false);
        }
      }, 250);
      this.status = "Share this code. Players have five minutes to join.";
    });
  }
  private voteListeners = new Set<string>();
  private watchVotes() {
    for (const [index, member] of this.members.entries()) {
      if (
        !member ||
        member.uid === this.uid ||
        this.voteListeners.has(member.uid)
      )
        continue;
      this.voteListeners.add(member.uid);
      this.off.push(
        onChildAdded(
          this.path(
            `inputs/${member.uid}`,
            memberRoom(
              {
                roomIDs: this.roomIDs,
                members: this.members,
                version: PARTY_VERSION,
              },
              index,
            ),
          ),
          (snapshot) => {
            try {
              const packet = JSON.parse(snapshot.val());
              if (
                packet.channel !== "party_vote" ||
                this.finishing ||
                !PARTY_MAPS.includes(packet.payload)
              )
                return;
              this.votes = { ...this.votes, [member.uid]: packet.payload };
              void this.broadcast();
            } catch {
              /* Non-vote input. */
            }
          },
        ),
      );
    }
  }
  private async broadcast() {
    if (this.uid !== this.hostUID || this.started || !this.code) return;
    this.watchVotes();
    const state = {
      members: this.members.filter(Boolean),
      votes: this.votes,
      deadline: this.deadline,
      count: this.count,
    };
    const id = push(this.path(`inputs/${this.uid}`)).key!;
    const paths = Object.fromEntries(
      this.roomIDs.map((room) => [
        `rooms/${room}/inputs/${this.uid}/${id}`,
        partyControl("party_lobby", state),
      ]),
    );
    try {
      await update(ref(friendsDB), paths);
    } catch {
      this.status = "Waiting for the connection…";
    }
  }
  private async join() {
    if (!this.displayName || !/^[A-Za-z0-9_-]{1,30}$/.test(this.inputCode))
      return;
    await this.action(async () => {
      const meta = (
        await get(ref(friendsDB, `rooms/${this.inputCode}/meta`))
      ).val();
      if (meta?.version !== PARTY_VERSION || meta.host.uid === this.uid)
        throw Error("Unavailable room");
      const occupied = await Promise.all(
        (meta.roomIDs as string[]).map(async (room) =>
          (await get(ref(friendsDB, `rooms/${room}/guest`))).val(),
        ),
      );
      if (occupied.some((member) => member?.uid === this.uid)) {
        this.status = "You already joined this room. Use your original tab.";
        return;
      }
      const me = this.myMember();
      for (const room of meta.roomIDs as string[]) {
        const claim = await runTransaction(
          ref(friendsDB, `rooms/${room}/guest`),
          (value) => (value === null ? me : undefined),
        );
        if (!claim.committed) continue;
        if (this.disposed) {
          await set(ref(friendsDB, `rooms/${room}/closed`), true);
          return;
        }
        this.code = this.inputCode;
        this.myRoom = room;
        this.roomIDs = meta.roomIDs;
        this.hostUID = meta.host.uid;
        this.count = meta.partyCount;
        this.activity = meta.partyActivity ?? "standard";
        this.settings = roomSettings(meta.settings);
        this.started = false;
        this.off.push(
          onChildAdded(this.path(`inputs/${this.hostUID}`), (snapshot) => {
            try {
              const packet = JSON.parse(snapshot.val());
              if (packet.channel !== "party_lobby") return;
              this.members = packet.payload.members;
              this.votes = packet.payload.votes;
              this.deadline = packet.payload.deadline;
            } catch {
              /* Game or chat input. */
            }
          }),
        );
        this.off.push(
          onValue(this.path("start"), (snapshot) => {
            if (!snapshot.exists() || this.started) return;
            const { friendsParty, ...start } = JSON.parse(
              snapshot.val(),
            ) as WireGameStartInfo & { friendsParty: PartyInfo };
            this.members = friendsParty.members;
            this.roomIDs = friendsParty.roomIDs;
            this.launch(start, me);
          }),
        );
        this.off.push(
          onValue(this.path("meta"), (snapshot) => {
            if (!snapshot.exists() && !this.started) {
              this.status = "The host left the room.";
              this.cleanup();
              this.code = "";
            }
          }),
        );
        this.timer = setInterval(
          () =>
            (this.seconds = Math.max(
              0,
              Math.ceil((this.deadline - Date.now()) / 1000),
            )),
          250,
        );
        this.status =
          "Joined. Waiting for all players, then map voting begins.";
        return;
      }
      throw Error("Full room");
    });
  }
  private async vote(map: GameMapType) {
    if (!this.code || !this.deadline || this.finishing) return;
    this.votes = { ...this.votes, [this.uid]: map };
    if (this.uid === this.hostUID) await this.broadcast();
    else
      try {
        await push(
          this.path(`inputs/${this.uid}`),
          partyControl("party_vote", map),
        );
      } catch {
        this.status = "Vote was not sent. Try again.";
      }
  }
  private async finish() {
    if (
      this.started ||
      this.finishing ||
      this.members.filter(Boolean).length !== this.count
    )
      return;
    this.finishing = true;
    try {
      const start = partyStart(
        this.code,
        this.members,
        choosePartyMap(this.votes, this.members),
        this.activity,
        this.settings,
      );
      const paths = Object.fromEntries(
        this.roomIDs.map((room) => [
          `rooms/${room}/start`,
          JSON.stringify({
            ...start,
            friendsParty: {
              roomIDs: this.roomIDs,
              members: this.members,
              version: PARTY_VERSION,
            },
          }),
        ]),
      );
      // Retain the room and its history for reconnecting; existing write window is two hours.
      for (const room of this.roomIDs)
        await onDisconnect(this.path("", room)).cancel();
      await update(ref(friendsDB), paths);
      this.launch(start, this.members[0]);
    } catch {
      this.finishing = false;
      this.status = "Could not start. Check the connection; voting will retry.";
    }
  }
  private launch(start: WireGameStartInfo, me: PartyMember) {
    if (this.started) return;
    this.started = true;
    const party: PartyInfo = {
      roomIDs: this.roomIDs,
      members: this.members,
      version: PARTY_VERSION,
    };
    const session: FriendsSession = {
      roomID: this.myRoom,
      uid: this.uid,
      clientID: me.clientID,
      hostUID: this.hostUID,
      guestUID: this.members[1].uid,
      party,
    };
    savePartyResume({ session, start, savedAt: Date.now() });
    this.cleanup();
    if (this.disposed) return;
    document.dispatchEvent(
      new CustomEvent("join-lobby", {
        detail: {
          gameID: start.gameID,
          gameStartInfo: start,
          source: "singleplayer",
          friendsSession: session,
          friendsPlayerName: me.name,
        },
      }),
    );
    this.dispatchEvent(new CustomEvent("party-launch", { bubbles: true }));
  }
  private async rejoin() {
    const saved = readPartyResume(this.uid);
    if (!saved) return;
    await this.action(async () => {
      const [startSnapshot, closedSnapshot] = await Promise.all([
        get(ref(friendsDB, `rooms/${saved.session.roomID}/start`)),
        get(ref(friendsDB, `rooms/${saved.session.roomID}/closed`)),
      ]);
      if (closedSnapshot.val()) throw Error("Ended match");
      const start = startSnapshot.val();
      if (!start) throw Error("Expired match");
      if (this.disposed) return;
      const info = JSON.parse(start) as WireGameStartInfo;
      if (info.gameID !== saved.start.gameID) throw Error("Different match");
      this.started = true;
      document.dispatchEvent(
        new CustomEvent("join-lobby", {
          detail: {
            gameID: info.gameID,
            gameStartInfo: info,
            source: "singleplayer",
            friendsSession: saved.session,
            friendsPlayerName: saved.session.party!.members.find(
              (member) => member.uid === this.uid,
            )!.name,
          },
        }),
      );
      this.dispatchEvent(new CustomEvent("party-launch", { bubbles: true }));
    });
  }
  private async leave(clearStatus = true) {
    this.cleanup();
    if (this.code && !this.started) {
      if (this.uid === this.hostUID)
        await Promise.all(
          this.roomIDs.map((room) =>
            remove(ref(friendsDB, `rooms/${room}`)).catch(() => {}),
          ),
        );
      else await set(this.path("closed"), true).catch(() => {});
    }
    this.code = "";
    this.members = [];
    this.votes = {};
    this.deadline = 0;
    this.finishing = false;
    this.voteListeners.clear();
    if (clearStatus) this.status = "Left the room.";
  }
  private renderSettings() {
    const change = (key: keyof FriendsRoomSettings, value: unknown) =>
      (this.settings = roomSettings({ ...this.settings, [key]: value }));
    return html`<fieldset class="friends-room-settings">
      <legend>Host settings</legend>
      <label
        >Map<select
          .value=${this.settings.map}
          aria-label="Room map"
          @change=${(e: Event) => change("map", (e.target as HTMLSelectElement).value)}
        >
          <option value="vote">Player vote</option>
          ${PARTY_MAPS.map((map) => html`<option value=${map}>${map}</option>`)}
        </select></label
      ><label
        >AI difficulty<select
          .value=${this.settings.difficulty}
          aria-label="Room AI difficulty"
          @change=${(e: Event) => change("difficulty", (e.target as HTMLSelectElement).value)}
        >
          ${Object.values(Difficulty).map((d) => html`<option value=${d} ?selected=${d === this.settings.difficulty}>${d}</option>`)}
        </select></label
      ><label
        >Starting gold<select
          .value=${String(this.settings.startingGold)}
          aria-label="Room starting gold"
          @change=${(e: Event) => change("startingGold", Number((e.target as HTMLSelectElement).value))}
        >
          ${[50000, 500000, 2000000].map((n) => html`<option value=${n}>${n.toLocaleString()}</option>`)}
        </select></label
      ><label
        ><input
          type="checkbox"
          .checked=${this.settings.aircraft}
          @change=${(e: Event) => change("aircraft", (e.target as HTMLInputElement).checked)}
        />Aircraft</label
      ><label
        ><input
          type="checkbox"
          .checked=${this.settings.nukes}
          @change=${(e: Event) => change("nukes", (e.target as HTMLInputElement).checked)}
        />Nuclear weapons</label
      >
    </fieldset>`;
  }
  render() {
    const disabled = this.busy || !this.uid || !this.displayName;
    return html`<section class="friends-party">
      <h3>Play with friends</h3>
      <p>Reconnectable rooms · map voting · 1v1 or 2v2</p>
      ${readPartyResume(this.uid) ? html`<button @click=${this.rejoin} ?disabled=${this.busy}>Rejoin last match</button><small>Same account and browser. Replays your match; larger worlds can take longer to catch up. Everyone waits if the host disconnects.</small>` : html``}
      ${this.code ? html`<p>Settings: ${this.settings.map} · ${this.settings.difficulty} AI · ${this.settings.startingGold.toLocaleString()} gold · aircraft ${this.settings.aircraft ? "on" : "off"} · nukes ${this.settings.nukes ? "on" : "off"}</p>` : this.renderSettings()}
      ${
        this.code
          ? html`<div class="party-code">
                Room code <strong>${this.code}</strong
                ><button
                  @click=${() => navigator.clipboard.writeText(this.code).catch(() => (this.status = "Select and copy the code above."))}
                >
                  Copy
                </button>
              </div>
              <ul>
                ${this.members.filter(Boolean).map((member, index) => html`<li>${member.name} ${member.uid === this.hostUID ? "· Host" : ""} ${this.activity === "survival" ? "· Allies" : this.count === 4 ? `· Team ${index < 2 ? 1 : 2}` : ""}</li>`)}
              </ul>
              <p>
                ${this.members.filter(Boolean).length} / ${this.count} players
                ${this.deadline ? `· Vote closes in ${this.seconds}s` : "· Waiting for players"}
              </p>
              ${
                this.deadline
                  ? html`<div
                        class="party-maps"
                        role="group"
                        aria-label="Map vote"
                      >
                        ${PARTY_MAPS.map((map) => html`<button aria-pressed=${this.votes[this.uid] === map} ?disabled=${this.finishing} @click=${() => this.vote(map)}>${map}<small>${this.members.filter((member) => member && this.votes[member.uid] === map).length} votes</small></button>`)}
                      </div>
                      <small
                        >Most votes wins. Ties use the host's vote, then the map
                        list order.</small
                      >`
                  : html``
              }
              <button @click=${() => this.leave()} ?disabled=${this.finishing}>
                Leave room
              </button>`
          : html`<div class="party-create">
                <label
                  >Game mode<select
                    .value=${this.activity}
                    @change=${(event: Event) => (this.activity = (event.target as HTMLSelectElement).value as typeof this.activity)}
                  >
                    <option value="standard">Standard</option>
                    <option value="survival">Co-op survival</option>
                    <option value="capture">Capture points</option>
                  </select></label
                >
                <label
                  >Match type<select
                    .value=${String(this.count)}
                    @change=${(event: Event) => (this.count = Number((event.target as HTMLSelectElement).value))}
                  >
                    <option value="4">
                      ${this.activity === "survival" ? "4 allies" : "2v2 · four players"}
                    </option>
                    <option value="2">
                      ${this.activity === "survival" ? "2 allies" : "1v1 · two players"}
                    </option>
                  </select></label
                ><button ?disabled=${disabled} @click=${this.create}>
                  Create room
                </button>
              </div>
              <form class="party-join"
                @submit=${(event: Event) => {
                  event.preventDefault();
                  void this.join();
                }}
              >
                <label
                  >Room code<input
                    required
                    maxlength="30"
                    placeholder="Paste a friend's code"
                    @input=${(event: Event) => (this.inputCode = (event.target as HTMLInputElement).value.trim())} /></label
                ><button ?disabled=${disabled}>Join room</button>
              </form>`
      }
      <p role="status">${this.status}</p>
    </section>`;
  }
}
