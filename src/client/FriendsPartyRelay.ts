import type { Turn, StampedIntent } from "@openfront/engine-api/Schemas";
import type {
  ClientMessage,
  ServerMessage,
} from "@openfront/shared/WireSchemas";
import {
  get,
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  set,
  update,
  type Unsubscribe,
} from "firebase/database";
import type { LobbyConfig } from "./ClientGameRunner";
import { readRoomChat } from "./FriendsChatTransport";
import {
  checkedPeerTurn,
  parsePeerIntent,
  PeerInputLimiter,
  secureRoomStartInfo,
} from "./FriendsFairPlay";
import { friendsDB } from "./FriendsFirebase";
import { reportFriendsMatchError } from "./FriendsMatchError";
import { memberRoom, savePartyResume } from "./FriendsParty";
import type { FriendsSession } from "./FriendsRelay";

type StoredTurn = Turn & { inputKeys: string[] };
const engineTurn = ({ turnNumber, intents }: Turn): Turn => ({
  turnNumber,
  intents,
});
/** The host atomically mirrors turns to the member-only rooms. A missing peer pauses
 * the shared timeline; rejoining replays that same timeline from turn zero. */
export class FriendsPartyRelay {
  private session: FriendsSession;
  private participantIDs: ReadonlySet<string>;
  private off: Unsubscribe[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private connect = () => {};
  private message: (message: ServerMessage) => void = () => {};
  private turns: StoredTurn[] = [];
  private consumed = new Set<string>();
  private inputLimiter = new PeerInputLimiter();
  private pending = new Map<string, StampedIntent>();
  private acks: Record<string, number> = {};
  private executed = 0;
  private writing = false;
  private stopped = false;
  private connected = false;
  private ready = false;
  private hashes: Record<string, Record<string, number>> = {};
  private waiting = false;
  private lastAdvance = Date.now();
  constructor(private config: LobbyConfig) {
    secureRoomStartInfo(config.gameStartInfo!);
    this.session = config.friendsSession!;
    this.participantIDs = new Set(
      this.session.party!.members.map((member) => member.clientID),
    );
  }
  updateCallback(
    connect: () => void,
    message: (message: ServerMessage) => void,
  ) {
    this.connect = connect;
    this.message = message;
  }
  private path(suffix: string, room = this.session.roomID) {
    return ref(friendsDB, `rooms/${room}/${suffix}`);
  }
  start() {
    void this.load().catch(() =>
      this.fail(
        "Could not restore this match. Return to Multiplayer and try Rejoin match.",
      ),
    );
  }
  private notice(text: string) {
    document.dispatchEvent(
      new CustomEvent("friends-online-notice", { detail: text }),
    );
  }
  private async load() {
    const s = this.session,
      party = s.party!;
    const history = (await get(this.path("turns"))).val() ?? {};
    const turns = Object.values(history).map((value) => {
      const turn = this.decodeTurn(value);
      if (!turn) throw new Error("Invalid multiplayer turn");
      return turn;
    });
    turns.sort((a, b) => a.turnNumber - b.turnNumber);
    turns.forEach((turn, index) => {
      if (turn.turnNumber !== index) throw new Error("Incomplete replay");
      (turn.inputKeys ?? []).forEach((key) => this.consumed.add(key));
    });
    if (this.stopped) return;
    this.turns = turns;
    // Zero is also the disconnect sentinel. It stalls the host safely until replay catches up.
    await onDisconnect(this.path(`acks/${s.uid}`)).set(0);
    await set(this.path(`acks/${s.uid}`), 0);
    if (this.stopped) return;
    savePartyResume({
      session: s,
      start: this.config.gameStartInfo!,
      savedAt: Date.now(),
    });
    document.dispatchEvent(
      new CustomEvent("friends-chat-session", {
        detail: {
          session: s,
          names: Object.fromEntries(
            party.members.map((member) => [member.uid, member.name]),
          ),
        },
      }),
    );
    this.connect();
    this.message({
      type: "start",
      gameStartInfo: this.config.gameStartInfo!,
      turns: turns.map(engineTurn),
      lobbyCreatedAt: this.config.gameStartInfo!.lobbyCreatedAt,
      myClientID: s.clientID,
    });
    this.off.push(
      onValue(ref(friendsDB, ".info/connected"), (snapshot) => {
        this.connected = snapshot.val() === true;
        if (this.connected) {
          void onDisconnect(this.path(`acks/${s.uid}`)).set(0);
          void set(this.path(`acks/${s.uid}`), this.executed).catch(() => {});
        }
        this.notice(
          this.connected
            ? "Connected. Catching up with the match…"
            : "Connection lost. Reconnecting to the same match…",
        );
      }),
    );
    this.off.push(
      onValue(this.path("closed"), (snapshot) => {
        if (snapshot.exists())
          this.fail("This room ended or went out of sync. Start a new room.");
      }),
    );
    if (s.uid !== s.hostUID)
      this.off.push(
        onChildAdded(
          this.path("turns"),
          (snapshot) => {
            if (!this.stopped) this.acceptTurn(snapshot.val());
          },
          () => this.fail("Could not read match history."),
        ),
      );
    if (s.uid === s.hostUID) {
      for (const [index, member] of party.members.entries()) {
        const room = memberRoom(party, index);
        this.off.push(
          onValue(this.path(`acks/${member.uid}`, room), (snapshot) => {
            this.acks[member.uid] = snapshot.val() ?? 0;
          }),
        );
        this.off.push(
          onValue(this.path("hashes", room), (snapshot) => {
            for (const [turn, values] of Object.entries(
              snapshot.val() ?? {},
            ) as [string, Record<string, number>][]) {
              this.hashes[turn] = { ...this.hashes[turn], ...values };
              if (
                new Set(Object.values(this.hashes[turn])).size > 1 &&
                !this.stopped
              ) {
                void update(
                  ref(friendsDB),
                  Object.fromEntries(
                    party.roomIDs.map((id) => [`rooms/${id}/closed`, true]),
                  ),
                );
                this.fail("The match went out of sync. Start a new room.");
                return;
              }
            }
          }),
        );
        this.off.push(
          onChildAdded(this.path(`inputs/${member.uid}`, room), (snapshot) => {
            const key = `${member.uid}:${snapshot.key}`;
            if (this.consumed.has(key)) return;
            let intent: StampedIntent;
            try {
              const value = snapshot.val();
              if (typeof value !== "string" || value.length > 4096) return;
              intent = JSON.parse(value);
              if (!intent || typeof intent !== "object") return;
            } catch {
              return;
            }
            if (intent.type === "toggle_pause") {
              // Only forward new chat, never replay old chat or lobby control packets.
              const text = readRoomChat(snapshot.val());
              if (text !== null && this.ready) {
                const delivery = JSON.stringify({
                  type: "toggle_pause",
                  channel: "party_chat_delivery",
                  uid: member.uid,
                  text,
                });
                const id = push(this.path(`inputs/${s.hostUID}`)).key!;
                const paths = Object.fromEntries(
                  party.roomIDs.map((idRoom) => [
                    `rooms/${idRoom}/inputs/${s.hostUID}/${id}`,
                    delivery,
                  ]),
                );
                void update(ref(friendsDB), paths).catch(() => {});
              }
              return;
            }
            if (
              [
                "kick_player",
                "update_game_config",
                "change_game_mode",
              ].includes(intent.type)
            )
              return;
            const parsed = parsePeerIntent(intent, member.clientID);
            if (
              !parsed ||
              this.pending.size >= 128 ||
              !this.inputLimiter.allow(member.clientID)
            )
              return;
            this.pending.set(key, parsed);
          }),
        );
      }
      // Existing child events are delivered before this initial read completes.
      await Promise.all(
        party.members.map((member, index) =>
          get(this.path(`inputs/${member.uid}`, memberRoom(party, index))),
        ),
      );
    }
    if (this.stopped) return;
    this.ready = true;
    this.timer = setInterval(() => this.tick(), 100);
  }
  private decodeTurn(value: unknown): StoredTurn | null {
    const checked = checkedPeerTurn(value, this.participantIDs);
    if (!checked) return null;
    const inputKeys = (checked as Partial<StoredTurn>).inputKeys ?? [];
    if (
      !Array.isArray(inputKeys) ||
      inputKeys.length > 128 ||
      inputKeys.some((key) => typeof key !== "string" || key.length > 128)
    ) {
      return null;
    }
    return { ...checked, inputKeys };
  }
  private acceptTurn(value: unknown) {
    if (this.stopped) return;
    const turn = this.decodeTurn(value);
    if (!turn) {
      this.fail("Invalid multiplayer action detected. Start a new room.");
      return;
    }
    if (turn.turnNumber < this.turns.length) return;
    if (turn.turnNumber !== this.turns.length) {
      this.fail("Match history is incomplete. Try Rejoin match.");
      return;
    }
    this.turns.push(turn);
    (turn.inputKeys ?? []).forEach((key) => this.consumed.add(key));
    this.message({ type: "turn", turn: engineTurn(turn) });
    this.lastAdvance = Date.now();
    if (this.waiting) {
      this.waiting = false;
      this.notice("Players reconnected. Match resumed.");
    }
  }
  private tick() {
    if (this.stopped || !this.ready) return;
    const s = this.session,
      party = s.party!;
    if (Date.now() - this.lastAdvance > 5000 && !this.waiting) {
      this.waiting = true;
      this.notice(
        "Match paused while a player reconnects. Keep this tab open; use Rejoin match after a reload.",
      );
    }
    if (Date.now() - this.config.gameStartInfo!.lobbyCreatedAt > 7_000_000) {
      this.fail("This room's reconnect window has expired. Start a new match.");
      return;
    }
    if (s.uid !== s.hostUID || !this.connected || this.writing) return;
    if (
      party.members.some(
        (member) =>
          this.acks[member.uid] === undefined ||
          this.turns.length - this.acks[member.uid] >= 3,
      )
    )
      return;
    const entries = [...this.pending.entries()]
      .filter(([key]) => !this.consumed.has(key))
      .slice(0, 8);
    const turn: StoredTurn = {
      turnNumber: this.turns.length,
      intents: entries.map(([, intent]) => intent),
      inputKeys: entries.map(([key]) => key),
    };
    const paths = Object.fromEntries(
      party.roomIDs.map((room) => [
        `rooms/${room}/turns/${String(turn.turnNumber).padStart(8, "0")}`,
        JSON.stringify(turn),
      ]),
    );
    this.writing = true;
    void update(ref(friendsDB), paths)
      .then(() => {
        entries.forEach(([key]) => this.pending.delete(key));
        this.acceptTurn(turn);
      })
      .catch(() => {
        this.notice(
          "Waiting for the connection. The match will resume from the same turn.",
        );
      })
      .finally(() => {
        this.writing = false;
      });
  }
  onMessage(message: ClientMessage) {
    if (this.stopped) return;
    if (
      message.type === "hash" &&
      message.turnNumber % 100 === 0 &&
      this.connected
    )
      void set(
        this.path(`hashes/${message.turnNumber}/${this.session.uid}`),
        message.hash,
      ).catch(() => {});
    if (
      message.type === "intent" &&
      this.connected &&
      message.intent.type !== "toggle_pause"
    ) {
      void push(
        this.path(`inputs/${this.session.uid}`),
        JSON.stringify(message.intent),
      ).catch(() => this.notice("Action was not sent. Reconnecting…"));
    }
    if (message.type === "rejoin")
      this.message({
        type: "start",
        gameStartInfo: this.config.gameStartInfo!,
        turns: this.turns.map(engineTurn),
        lobbyCreatedAt: this.config.gameStartInfo!.lobbyCreatedAt,
        myClientID: this.session.clientID,
      });
  }
  turnComplete() {
    this.executed++;
    if (!this.stopped && this.connected)
      void set(this.path(`acks/${this.session.uid}`), this.executed).catch(
        () => {},
      );
  }
  private fail(text: string) {
    if (this.stopped) return;
    this.endGame();
    reportFriendsMatchError(
      text,
      this.config.gameStartInfo!.gameID,
      this.turns.length,
    );
  }
  endGame() {
    this.stopped = true;
    clearInterval(this.timer);
    this.off.splice(0).forEach((off) => off());
    void set(this.path(`acks/${this.session.uid}`), 0).catch(() => {});
    document.dispatchEvent(
      new CustomEvent("friends-chat-session", { detail: null }),
    );
  }
}
