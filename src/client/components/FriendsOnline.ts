import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
} from "@openfront/engine-api/game/GameTypes";
import { generateID } from "@openfront/shared/SharedUtil";
import { WireGameStartInfo } from "@openfront/shared/WireSchemas";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  set,
  Unsubscribe,
} from "firebase/database";
import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { validateDisplayName } from "../FriendsDisplayName";
import { friendsAuth, friendsDB } from "../FriendsFirebase";
import type { FriendsSession } from "../FriendsRelay";
import type { JoinLobbyEvent } from "../Main";
import "./FriendsPartyLobby";

type ListedRoom = {
  id: string;
  name: string;
  hostName: string;
  createdAt: number;
};
type Member = { uid: string; clientID: string; name: string };
const VERSION = "friends-v3-content-20261104";
export const MATCH_WAIT_MS = 20_000;
export function normalMatch(
  gameID: string,
  players: Member[],
  online: boolean,
): WireGameStartInfo {
  return {
    gameID,
    lobbyCreatedAt: Date.now(),
    players: players.map((p) => ({
      clientID: p.clientID,
      username: p.name,
      clanTag: null,
    })),
    config: {
      friendsAircraft: true,
      gameMap: GameMapType.World,
      gameMapSize: GameMapSize.Compact,
      gameType: online ? GameType.Private : GameType.Singleplayer,
      gameMode: GameMode.FFA,
      difficulty: Difficulty.Medium,
      donateGold: false,
      donateTroops: false,
      bots: 100,
      nations: "default",
      spawnImmunityDuration: 3000,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      randomSpawn: false,
      disabledUnits: [],
    },
  };
}
@customElement("friends-online")
export class FriendsOnline extends LitElement {
  @state() private opened = false;
  @state() private section: "friends" | "servers" = "friends";
  private returnFocus: HTMLElement | null = null;
  private async closePanel() {
    await this.cancelQueue?.();
    this.opened = false;
    this.directoryOff?.();
    this.returnFocus?.focus();
  }
  private dialogKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      void this.closePanel();
    }
    if (event.key !== "Tab") return;
    const nodes = [
      ...this.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href]",
      ),
    ].filter((n) => n.getClientRects().length);
    const first = nodes[0],
      last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  @state() private roomActivity: "standard" | "survival" | "capture" =
    "standard";
  @state() private user: User | null = null;
  @state() private busy = false;
  @state() private status = "";
  @state() private notice = "";
  @state() private seconds = 20;
  @state() private servers: ListedRoom[] = [];
  @state() private hostingCode = "";
  @state() private roomName = "";
  @state() private visibility = "public";
  private joinCode = "";
  private directoryOff?: Unsubscribe;
  private watchServers() {
    this.directoryOff?.();
    if (!this.opened || !this.user) return;
    this.directoryOff = onValue(
      ref(friendsDB, `servers/${VERSION}`),
      (snap) => {
        this.servers = Object.entries(snap.val() ?? {})
          .map(([id, v]) => ({ id, ...(v as Omit<ListedRoom, "id">) }))
          .filter((v) => Date.now() - v.createdAt < 300000)
          .sort((a, b) => b.createdAt - a.createdAt);
      },
      () => {
        this.status = "Server list unavailable. Try again shortly.";
      },
    );
  }
  @state() private displayName = "";
  @state() private savedDisplayName = "";
  @state() private nameLoading = false;
  private email = "";
  private password = "";
  private cancelQueue: (() => Promise<void>) | null = null;
  private authOff: Unsubscribe;
  createRenderRoot() {
    return this;
  }
  connectedCallback() {
    super.connectedCallback();
    this.authOff = onAuthStateChanged(friendsAuth, (u) => {
      this.user = u;
      this.displayName = "";
      this.savedDisplayName = "";
      this.nameLoading = Boolean(u);
      if (u) void this.loadDisplayName(u);
      this.directoryOff?.();
      this.servers = [];
      this.watchServers();
    });
    document.addEventListener("friends-online-error", this.matchError);
    document.addEventListener("friends-online-notice", this.matchNotice);
  }
  disconnectedCallback() {
    this.authOff?.();
    this.directoryOff?.();
    document.removeEventListener("friends-online-error", this.matchError);
    document.removeEventListener("friends-online-notice", this.matchNotice);
    void this.cancelQueue?.();
    super.disconnectedCallback();
  }
  private matchNotice = (e: Event) => {
    this.notice = (e as CustomEvent<string>).detail;
    setTimeout(() => {
      this.notice = "";
    }, 12000);
  };
  private matchError = (e: Event) => {
    this.status = (e as CustomEvent<string>).detail;
    this.opened = true;
  };
  open(activity: "standard" | "survival" | "capture" = "standard") {
    this.returnFocus = document.activeElement as HTMLElement;
    this.roomActivity = activity;
    this.opened = true;
    this.status = "";
    this.watchServers();
    void this.updateComplete.then(() =>
      this.querySelector<HTMLElement>(
        "[aria-label='Close multiplayer']",
      )?.focus(),
    );
  }
  openAccount(google = false) {
    this.open();
    this.status =
      "Sign in for multiplayer. Solo progress saves on this device; official OpenFront achievements are not available in this edition.";
    if (google && !this.user) void this.googleSignIn();
  }
  private googleSignIn() {
    return this.action(() =>
      signInWithPopup(friendsAuth, new GoogleAuthProvider()),
    );
  }
  private async loadDisplayName(user: User) {
    try {
      const snapshot = await get(
        ref(friendsDB, `profiles/${user.uid}/displayName`),
      );
      if (this.user?.uid !== user.uid) return;
      if (snapshot.exists()) {
        const name = validateDisplayName(snapshot.val());
        this.displayName = name;
        this.savedDisplayName = name;
      }
    } catch {
      if (this.user?.uid === user.uid)
        this.status =
          "Could not load your display name. You can save a name below.";
    } finally {
      if (this.user?.uid === user.uid) this.nameLoading = false;
    }
  }
  private async saveDisplayName() {
    if (!this.user || this.busy || this.nameLoading) return;
    let name: string;
    try {
      name = validateDisplayName(this.displayName);
    } catch (error) {
      this.status = (error as Error).message;
      return;
    }
    const uid = this.user.uid;
    await this.action(async () => {
      await set(ref(friendsDB, `profiles/${uid}/displayName`), name);
      if (this.user?.uid !== uid) return;
      this.displayName = name;
      this.savedDisplayName = name;
      this.status = "Display name saved. New matches will use " + name + ".";
    });
  }
  private async action(fn: () => Promise<unknown>) {
    if (this.busy) return;
    this.busy = true;
    this.status = "";
    try {
      await fn();
    } catch (e) {
      const code = (e as { code?: string }).code;
      this.status = code
        ? code.replace("auth/", "").replace(/-/g, " ")
        : "Connection failed. Please try again.";
    } finally {
      this.busy = false;
    }
  }
  private async emailAuth(create = false) {
    await this.action(async () => {
      if (!this.email || this.password.length < 6)
        throw { code: "auth/enter-email-and-password-at-least-6-characters" };
      if (create)
        await createUserWithEmailAndPassword(
          friendsAuth,
          this.email,
          this.password,
        );
      else
        await signInWithEmailAndPassword(
          friendsAuth,
          this.email,
          this.password,
        );
      this.password = "";
    });
  }
  private launch(
    info: WireGameStartInfo,
    me: Member,
    session?: FriendsSession,
  ) {
    this.opened = false;
    this.busy = false;
    document.dispatchEvent(
      new CustomEvent<JoinLobbyEvent>("join-lobby", {
        detail: {
          gameID: info.gameID,
          gameStartInfo: info,
          source: "singleplayer",
          friendsSession: session,
          friendsPlayerName: me.name,
        },
      }),
    );
  }
  private async matchmaking(
    mode: "quick" | "public" | "private" | "join" = "quick",
    requested = "",
  ) {
    if (!this.user || this.busy || this.nameLoading) return;
    if (mode === "join" && !/^[A-Za-z0-9_-]{1,30}$/.test(requested.trim())) {
      this.status = "Enter a valid room code.";
      return;
    }
    if (!this.savedDisplayName) {
      this.status = "Choose and save a display name before joining a match.";
      return;
    }
    this.busy = true;
    this.status = "Searching for another commander...";
    this.seconds = mode === "public" || mode === "private" ? 300 : 20;
    this.hostingCode = "";
    const me: Member = {
      uid: this.user.uid,
      clientID: generateID(),
      name: this.savedDisplayName,
    };
    let done = false;
    let off: Unsubscribe = () => {};
    let queueOff: Unsubscribe = () => {};
    let swapping = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let roomID = "";
    let ownRoom = false;
    const queue = ref(friendsDB, `queue/${VERSION}/${me.uid}`);
    const clean = async () => {
      off();
      queueOff();
      clearInterval(interval);
      clearTimeout(timeout);
      this.cancelQueue = null;
      if (ownRoom) {
        await onDisconnect(ref(friendsDB, `rooms/${roomID}`)).cancel();
        await remove(queue);
        await remove(ref(friendsDB, `servers/${VERSION}/${roomID}`));
      }
      this.hostingCode = "";
    };
    const abort = async () => {
      if (done) return;
      done = true;
      await clean();
      if (roomID) {
        if (ownRoom) await remove(ref(friendsDB, `rooms/${roomID}`));
        else await set(ref(friendsDB, `rooms/${roomID}/closed`), true);
      }
      this.busy = false;
      this.status = "Search cancelled.";
    };
    this.cancelQueue = abort;
    try {
      const entries =
        mode === "quick" ? await get(ref(friendsDB, `queue/${VERSION}`)) : null;
      const candidates =
        mode === "join"
          ? [{ roomID: requested.trim(), createdAt: Date.now() }]
          : Object.values(entries?.val() ?? {});
      if (done) return;
      for (const item of candidates as {
        roomID: string;
        createdAt: number;
      }[]) {
        if (Date.now() - item.createdAt > 25_000) continue;
        const meta = (
          await get(ref(friendsDB, `rooms/${item.roomID}/meta`))
        ).val();
        if (
          !meta ||
          meta.host.uid === me.uid ||
          (mode === "join" && meta.version !== VERSION)
        )
          continue;
        // Only one guest can claim this room. Host timeout races this same node.
        const claim = await runTransaction(
          ref(friendsDB, `rooms/${item.roomID}/guest`),
          (current) => (current === null ? me : undefined),
        );
        if (!claim.committed) continue;
        roomID = item.roomID;
        this.status = "Player found! Preparing the world...";
        off = onValue(ref(friendsDB, `rooms/${roomID}/start`), (x) => {
          if (!x.exists() || done) return;
          done = true;
          void clean();
          this.launch(JSON.parse(x.val()), me, {
            roomID,
            uid: me.uid,
            hostUID: meta.host.uid,
            guestUID: me.uid,
            clientID: me.clientID,
          });
        });
        timeout = setTimeout(() => {
          if (done) return;
          done = true;
          void clean();
          this.busy = false;
          this.status = "The host did not start. Please search again.";
        }, 30_000);
        return;
      }
      if (mode === "join") throw new Error("Room unavailable");
      roomID = generateID();
      ownRoom = true;
      const createdAt = Date.now();
      await set(ref(friendsDB, `rooms/${roomID}/meta`), {
        host: me,
        createdAt,
        version: VERSION,
        visibility: mode === "private" ? "private" : "public",
        named: mode !== "quick",
        name: (this.roomName.trim() || `${me.name}'s room`).slice(0, 40),
      });
      await onDisconnect(ref(friendsDB, `rooms/${roomID}`)).remove();
      await onDisconnect(queue).remove();
      if (mode === "quick") await set(queue, { roomID, createdAt: Date.now() });
      else {
        this.hostingCode = roomID;
        this.status = "Room open. The match starts when a second player joins.";
        if (mode === "public") {
          const listing = ref(friendsDB, `servers/${VERSION}/${roomID}`);
          await onDisconnect(listing).remove();
          await set(listing, {
            name: (this.roomName.trim() || `${me.name}'s room`).slice(0, 40),
            hostName: me.name,
            createdAt,
          });
        }
      }
      off = onValue(
        ref(friendsDB, `rooms/${roomID}/guest`),
        async (x) => {
          const guest = x.val() as Member | null;
          if (!guest || done || guest.uid === "closed") return;
          done = true;
          await clean();
          const info = normalMatch(roomID, [me, guest], true);
          await set(
            ref(friendsDB, `rooms/${roomID}/start`),
            JSON.stringify(info),
          );
          this.launch(info, me, {
            roomID,
            uid: me.uid,
            hostUID: me.uid,
            guestUID: guest.uid,
            clientID: me.clientID,
          });
        },
        () => {
          void abort();
          this.status = "Matchmaking connection lost. Try again.";
        },
      );
      // A queue subscription also handles two people searching at the same instant.
      // The larger room id yields, so only one side attempts the transfer.
      queueOff =
        mode === "quick"
          ? onValue(ref(friendsDB, `queue/${VERSION}`), async (snapshot) => {
              if (done || swapping) return;
              const other = (
                Object.values(snapshot.val() ?? {}) as {
                  roomID: string;
                  createdAt: number;
                }[]
              ).find(
                (x) => x.roomID < roomID && Date.now() - x.createdAt < 25000,
              );
              if (!other) return;
              swapping = true;
              try {
                const reserved = await runTransaction(
                  ref(friendsDB, `rooms/${roomID}/guest`),
                  (x) =>
                    x === null
                      ? { uid: "closed", clientID: "closed", name: "closed" }
                      : undefined,
                );
                if (!reserved.committed || done) return;
                off();
                queueOff();
                clearInterval(interval);
                clearTimeout(timeout);
                const previousRoom = roomID;
                await remove(queue);
                await remove(ref(friendsDB, `rooms/${previousRoom}`));
                ownRoom = false;
                roomID = other.roomID;
                const meta = (
                  await get(ref(friendsDB, `rooms/${roomID}/meta`))
                ).val();
                const claimed = await runTransaction(
                  ref(friendsDB, `rooms/${roomID}/guest`),
                  (x) => (x === null ? me : undefined),
                );
                if (!claimed.committed || !meta) {
                  done = true;
                  await clean();
                  this.busy = false;
                  void this.matchmaking();
                  return;
                }
                this.status = "Player found! Preparing the world...";
                off = onValue(ref(friendsDB, `rooms/${roomID}/start`), (x) => {
                  if (!x.exists() || done) return;
                  done = true;
                  void clean();
                  this.launch(JSON.parse(x.val()), me, {
                    roomID,
                    uid: me.uid,
                    hostUID: meta.host.uid,
                    guestUID: me.uid,
                    clientID: me.clientID,
                  });
                });
                timeout = setTimeout(() => {
                  if (done) return;
                  done = true;
                  void clean();
                  this.busy = false;
                  this.status = "The host did not start. Please search again.";
                }, 30000);
              } catch {
                if (!done) {
                  done = true;
                  await clean().catch(() => {});
                  this.busy = false;
                  this.status = "Connection interrupted. Please search again.";
                }
              }
            })
          : () => {};
      interval = setInterval(() => {
        this.seconds = Math.max(0, this.seconds - 1);
      }, 1000);
      timeout = setTimeout(
        async () => {
          // Reserve the empty guest slot before fallback, preventing a late join.
          const claim = await runTransaction(
            ref(friendsDB, `rooms/${roomID}/guest`),
            (x) =>
              x === null
                ? { uid: "closed", clientID: "closed", name: "closed" }
                : undefined,
          );
          if (!claim.committed || done) return;
          done = true;
          await clean();
          await remove(ref(friendsDB, `rooms/${roomID}`));
          this.launch(normalMatch(generateID(), [me], false), me);
          this.notice = "No players joined. Starting a Normal AI match.";
          setTimeout(() => {
            this.notice = "";
          }, 10000);
        },
        mode === "quick" ? MATCH_WAIT_MS : 300000,
      );
    } catch (e) {
      done = true;
      await clean().catch(() => {});
      if (ownRoom && roomID)
        await remove(ref(friendsDB, `rooms/${roomID}`)).catch(() => {});
      this.busy = false;
      this.status =
        mode === "join"
          ? "This room is full, expired or unavailable."
          : "Could not reach matchmaking. Check your connection and try again.";
      console.error("Matchmaking failed", e);
    }
  }
  private renderServers() {
    const disabled = this.busy || this.nameLoading || !this.savedDisplayName;
    return html`<div class="server-browser">
      <div class="server-heading">
        <h3>Public servers</h3>
        <button ?disabled=${this.busy} @click=${() => this.watchServers()}>
          Refresh
        </button>
      </div>
      <p class="online-help">
        World map · Normal AI · 2 players + AI. Matches start when someone
        joins.
      </p>
      <div class="server-list">
        ${
          this.servers.length
            ? this.servers.map(
                (room) =>
                  html`<div class="server-row">
                    <div>
                      <strong>${room.name}</strong
                      ><small>${room.hostName} · 1 / 2 players</small>
                    </div>
                    <button
                      ?disabled=${disabled}
                      @click=${() => this.matchmaking("join", room.id)}
                    >
                      Join
                    </button>
                  </div>`,
              )
            : html`<p class="server-empty">
                No open servers. Host one below or use Quick play.
              </p>`
        }
      </div>
      <div class="server-create">
        <h3>Host a server</h3>
        <label
          >Server name<input
            maxlength="40"
            placeholder="Friday night"
            ?disabled=${this.busy}
            .value=${this.roomName}
            @input=${(e: Event) => (this.roomName = (e.target as HTMLInputElement).value)} /></label
        ><label
          >Visibility<select
            ?disabled=${this.busy}
            .value=${this.visibility}
            @change=${(e: Event) => (this.visibility = (e.target as HTMLSelectElement).value)}
          >
            <option value="public">Public — listed for everyone</option>
            <option value="private">Private — room code only</option>
          </select></label
        ><button
          ?disabled=${disabled}
          @click=${() => this.matchmaking(this.visibility === "private" ? "private" : "public")}
        >
          Create server
        </button>
        ${
          this.hostingCode
            ? html`<p class="room-code">
                  Room code <strong>${this.hostingCode}</strong
                  ><button
                    @click=${() =>
                      navigator.clipboard
                        .writeText(this.hostingCode)
                        .then(() => (this.status = "Code copied."))
                        .catch(
                          () =>
                            (this.status =
                              "Select and copy the room code above."),
                        )}
                  >
                    Copy
                  </button>
                </p>
                <small
                  >Waiting up to five minutes, then starting with Normal
                  AI.</small
                >`
            : html``
        }
      </div>
      <form
        class="server-code-form"
        @submit=${(e: Event) => {
          e.preventDefault();
          void this.matchmaking("join", this.joinCode);
        }}
      >
        <label
          >Join a private server<input
            required
            maxlength="30"
            placeholder="Room code"
            ?disabled=${this.busy}
            @input=${(e: Event) => (this.joinCode = (e.target as HTMLInputElement).value.trim())} /></label
        ><button ?disabled=${disabled}>Join by code</button>
      </form>
    </div>`;
  }
  render() {
    if (!this.opened)
      return this.notice
        ? html`<div class="friends-online-notice" role="status">
            ${this.notice}
          </div>`
        : html``;
    const nameForm = html`<form
      class="fo-name-form"
      @submit=${(event: Event) => {
        event.preventDefault();
        void this.saveDisplayName();
      }}
    >
      <label
        >Display name<input
          required
          minlength="2"
          maxlength="20"
          autocomplete="nickname"
          placeholder="Your commander name"
          .value=${this.displayName}
          ?disabled=${this.busy || this.nameLoading}
          @input=${(event: Event) => (this.displayName = (event.target as HTMLInputElement).value)} /></label
      ><button
        ?disabled=${this.busy || this.nameLoading || this.displayName === this.savedDisplayName}
      >
        Save name
      </button>
    </form>`;
    return html`<div class="friends-online-backdrop" @keydown=${this.dialogKey}>
      <section
        class="friends-online-panel fo-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Multiplayer and account"
      >
        <header class="fo-header">
          <div>
            <span class="fh-eyebrow">BRING YOUR FRIENDS</span>
            <h2>Multiplayer</h2>
          </div>
          <button
            aria-label="Close multiplayer"
            @click=${() => this.closePanel()}
          >
            Close
          </button>
        </header>
        ${
          this.user
            ? html`
                <div class="fo-account">
                  <span
                    >${this.savedDisplayName ? html`Playing as <strong>${this.savedDisplayName}</strong>` : "Choose your display name to join a room."}</span
                  ><button
                    ?disabled=${this.busy}
                    @click=${() => this.action(() => signOut(friendsAuth))}
                  >
                    Sign out
                  </button>
                </div>
                ${
                  this.savedDisplayName
                    ? html`<details class="fo-name-edit">
                        <summary>Edit display name</summary>
                        ${nameForm}
                      </details>`
                    : nameForm
                }
                <nav class="fo-mode-nav" aria-label="Multiplayer mode">
                  <button
                    aria-pressed=${this.section === "friends"}
                    @click=${() => (this.section = "friends")}
                  >
                    Play with friends <small>Private · 1v1 / 2v2</small>
                  </button>
                  <button
                    aria-pressed=${this.section === "servers"}
                    @click=${() => (this.section = "servers")}
                  >
                    Find a match <small>Quick play · public servers</small>
                  </button>
                </nav>
                <div ?hidden=${this.section !== "friends"}>
                  <friends-party-lobby
                    .uid=${this.user.uid}
                    .displayName=${this.savedDisplayName}
                    .activity=${this.roomActivity}
                    @party-launch=${() => {
                      this.opened = false;
                      this.directoryOff?.();
                    }}
                  ></friends-party-lobby>
                </div>
                <section
                  class="fo-classic"
                  ?hidden=${this.section !== "servers"}
                >
                  <h3>Quick play & public servers</h3>
                  ${this.renderServers()}
                  <div class="fo-quick">
                    <button
                      class="fo-primary"
                      ?disabled=${this.busy || this.nameLoading || !this.savedDisplayName}
                      @click=${() => this.matchmaking()}
                    >
                      ${this.busy ? `Waiting · ${this.seconds}s` : "Quick play"}</button
                    ><button
                      ?disabled=${!this.cancelQueue}
                      @click=${() => this.cancelQueue?.()}
                    >
                      Leave waiting room
                    </button>
                  </div>
                  <small
                    >Quick play searches for 20 seconds, then starts a Normal AI
                    game if nobody joins.</small
                  >
                </section>
              `
            : html`
                <div class="fo-auth-grid">
                  <aside class="fo-auth-story">
                    <span class="fh-eyebrow">BETTER TOGETHER</span>
                    <h3>Bring your allies.<br />Build your empire.</h3>
                    <p>One world. Your strategy.</p>
                    <ul>
                      <li>Private rooms with shareable codes</li>
                      <li>1v1 battles and 2v2 teams</li>
                      <li>Map voting and reconnectable matches</li>
                    </ul>
                  </aside>
                  <div class="fo-auth-card">
                    <div class="fo-auth-intro">
                      <h3>Your next match starts here.</h3>
                      <p>
                        Sign in to create a room or join your friends. Solo and
                        missions are available without an account.
                      </p>
                    </div>
                    <button
                      class="fo-primary fo-google"
                      ?disabled=${this.busy}
                      @click=${() => this.googleSignIn()}
                    >
                      Continue with Google <span aria-hidden="true">↗</span>
                    </button>
                    <details class="fo-email">
                      <summary>Use email instead</summary>
                      <form
                        @submit=${(event: Event) => {
                          event.preventDefault();
                          void this.emailAuth();
                        }}
                      >
                        <div class="fo-email-fields">
                          <label
                            >Email<input
                              type="email"
                              autocomplete="email"
                              required
                              @input=${(event: Event) => (this.email = (event.target as HTMLInputElement).value)} /></label
                          ><label
                            >Password<input
                              type="password"
                              autocomplete="current-password"
                              required
                              minlength="6"
                              .value=${this.password}
                              @input=${(event: Event) => (this.password = (event.target as HTMLInputElement).value)}
                          /></label>
                        </div>
                        <div class="online-buttons">
                          <button ?disabled=${this.busy}>Sign in</button
                          ><button
                            type="button"
                            ?disabled=${this.busy}
                            @click=${() => this.emailAuth(true)}
                          >
                            Create account</button
                          ><button
                            type="button"
                            ?disabled=${this.busy}
                            @click=${() =>
                              this.action(async () => {
                                await sendPasswordResetEmail(
                                  friendsAuth,
                                  this.email,
                                );
                                this.status = "Password reset email sent.";
                              })}
                          >
                            Reset password
                          </button>
                        </div>
                      </form>
                    </details>
                  </div>
                </div>
              `
        }
        <p class="fo-status" role="status" aria-live="polite">${this.status}</p>
        <footer class="fo-footer">
          Private, peer-hosted matches. Keep the host's tab open.
        </footer>
      </section>
    </div>`;
  }
}
