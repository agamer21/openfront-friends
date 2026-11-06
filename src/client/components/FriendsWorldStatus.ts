import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { ControlPanel } from "../hud/layers/ControlPanel";
import { commandIcon } from "./FriendsIcons";

@customElement("friends-world-status")
export class FriendsWorldStatus extends LitElement {
  @state() private data: {
    share: number;
    leaderShare: number;
    leader: string;
    rank: number;
    goal: number;
    protectedSeconds: number;
    elapsed: number;
  } | null = null;
  private lastGame: ControlPanel["game"] | undefined;
  private lastTick = -1;
  private timer: ReturnType<typeof setInterval> | undefined;
  @state() private bannerVisible = false;
  private announcedGame: ControlPanel["game"] | undefined;
  private bannerTimer: ReturnType<typeof setTimeout> | undefined;
  createRenderRoot() {
    return this;
  }
  connectedCallback() {
    super.connectedCallback();
    this.timer = setInterval(() => this.refresh(), 500);
  }
  disconnectedCallback() {
    clearInterval(this.timer);
    clearTimeout(this.bannerTimer);
    super.disconnectedCallback();
  }
  private refresh() {
    // Background tabs do no HUD work; the next visible poll catches up.
    if (document.hidden) return;
    const game = document.querySelector<ControlPanel>("control-panel")?.game;
    if (
      !document.querySelector(".in-game") ||
      !game ||
      game.config().gameConfig().friendsMode
    ) {
      if (this.data) this.data = null;
      this.lastGame = undefined;
      this.lastTick = -1;
      return;
    }
    const player = game.myPlayer();
    if (!player || game.inSpawnPhase()) {
      if (this.data) this.data = null;
      this.lastGame = undefined;
      this.lastTick = -1;
      return;
    }
    // Paused simulations need no repeated player scan or Lit render.
    if (this.lastGame === game && this.lastTick === game.ticks()) return;
    this.lastGame = game;
    this.lastTick = game.ticks();
    if (this.announcedGame !== game) {
      this.announcedGame = game;
      this.bannerVisible = true;
      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => {
        this.bannerVisible = false;
      }, 4000);
    }
    const tiles = Math.max(1, game.numLandTiles());
    const mine = player.numTilesOwned();
    let leader = player;
    let rank = 1;
    for (const other of game.players()) {
      if (other.numTilesOwned() > leader.numTilesOwned()) leader = other;
      if (other.numTilesOwned() > mine) rank++;
    }
    const config = game.config();
    const elapsed = Math.max(
      0,
      (game.ticks() - config.numSpawnPhaseTurns()) / 10,
    );
    this.data = {
      share: (mine / tiles) * 100,
      leaderShare: (leader.numTilesOwned() / tiles) * 100,
      leader: leader.name(),
      rank,
      goal: config.percentageTilesOwnedToWinTenths(elapsed) / 10,
      protectedSeconds: config.hasExtendedSpawnImmunity()
        ? Math.min(
            config.spawnImmunityDuration() / 10,
            Math.max(
              0,
              (config.numSpawnPhaseTurns() +
                config.spawnImmunityDuration() -
                game.ticks()) /
                10,
            ),
          )
        : 0,
      elapsed,
    };
  }
  render() {
    const d = this.data;
    if (!d) return html``;
    const time = d.protectedSeconds || d.elapsed;
    return html`${this.bannerVisible ? html`<div class="world-war-banner" role="status"><strong>THE WAR BEGINS</strong><span>Expand, build, and lead your nation.</span></div>` : ""}
      <section class="world-command-status" aria-label="Live world control">
        <div class="world-command-clock">
          <small>${d.protectedSeconds > 0 ? "PROTECTED" : "MATCH TIME"}</small
          ><strong
            >${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}</strong
          >
        </div>
        <div class="world-command-progress">
          <header>
            <span>${commandIcon("globe")} WORLD CONTROL</span
            ><b>GOAL ${d.goal.toFixed(0)}%</b>
          </header>
          <progress
            aria-label="Territory towards victory"
            max=${d.goal}
            value=${d.share}
          ></progress>
          <footer>
            <span>You ${d.share.toFixed(2)}%</span
            ><span
              >${commandIcon("crown")} ${d.leader}
              ${d.leaderShare.toFixed(2)}%</span
            >
          </footer>
        </div>
        <div class="world-command-rank" aria-label="World rank">#${d.rank}</div>
      </section>`;
  }
}
