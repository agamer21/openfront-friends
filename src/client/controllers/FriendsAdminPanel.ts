import { GameType } from "@openfront/engine-api/game/GameTypes";
import type { FriendsAdminIntent } from "@openfront/engine-api/Schemas";
import type { EventBus } from "@openfront/shared/EventBus";
import type { Controller } from "../Controller";
import { FriendsAdminIntentEvent } from "../Transport";
import type { GameView } from "../view";
import "../components/friends-admin.css";

export class FriendsAdminPanel implements Controller {
  private root?: HTMLDivElement;
  private dot?: HTMLButtonElement;
  private panel?: HTMLElement;
  constructor(
    private game: GameView,
    private bus: EventBus,
  ) {}
  init() {
    if (process.env.FRIENDS_STATIC !== "true") return;
    const root = (this.root = document.createElement("div"));
    root.className = "friends-admin";
    root.innerHTML = `<button class="friends-admin-dot" aria-label="Open admin panel" aria-expanded="false" title="Admin panel"><span></span></button><section class="friends-admin-panel" hidden aria-label="Host admin panel"><header><strong>Host controls</strong><button aria-label="Close admin panel">×</button></header><p>Changes apply to your nation and synchronize with the match.</p><label>Amount<input type="number" aria-label="Admin resource amount" value="1000000" min="1" max="1000000000" step="1"></label><div class="friends-admin-actions"></div><small role="status">Resources update on the next simulation turn.</small></section>`;
    this.dot = root.querySelector(".friends-admin-dot")!;
    this.panel = root.querySelector("section")!;
    const show = (open: boolean) => {
      this.panel!.hidden = !open;
      this.dot!.setAttribute("aria-expanded", String(open));
      if (open) this.panel!.querySelector<HTMLInputElement>("input")?.focus();
      else this.dot!.focus();
    };
    this.dot.onclick = () => show(Boolean(this.panel!.hidden));
    root.querySelector<HTMLButtonElement>("header button")!.onclick = () =>
      show(false);
    for (const event of [
      "pointerdown",
      "pointerup",
      "click",
      "dblclick",
      "wheel",
      "keydown",
      "keyup",
    ])
      root.addEventListener(event, (e) => {
        e.stopPropagation();
        if (event === "keydown" && (e as KeyboardEvent).key === "Escape")
          show(false);
      });
    const actions = root.querySelector(".friends-admin-actions")!;
    const add = (
      label: string,
      action: FriendsAdminIntent["action"],
      enabled = false,
    ) => {
      const button = document.createElement("button");
      button.textContent = label;
      button.onclick = () => {
        const input = root.querySelector<HTMLInputElement>("input")!;
        if (!input.reportValidity() || !this.allowed()) return;
        const amount = Number(input.value);
        if (
          !Number.isSafeInteger(amount) ||
          amount < 1 ||
          amount > 1_000_000_000
        )
          return;
        this.bus.emit(
          new FriendsAdminIntentEvent({
            type: "friends_admin",
            action,
            amount,
            enabled,
          }),
        );
        root.querySelector<HTMLElement>("[role=status]")!.textContent =
          `${label} requested. Applies on the next turn.`;
      };
      actions.append(button);
    };
    add("Give gold", "gold");
    add("Give troops", "troops");
    add("Infinite gold on", "infiniteGold", true);
    add("Infinite gold off", "infiniteGold");
    add("Infinite troops on", "infiniteTroops", true);
    add("Infinite troops off", "infiniteTroops");
    document.body.append(root);
    this.tick();
  }
  private allowed() {
    const me = this.game.myPlayer(),
      config = this.game.config().gameConfig();
    return Boolean(
      me?.isAlive() &&
      me.isLobbyCreator() &&
      (config.gameType === GameType.Singleplayer ||
        (config.gameType === GameType.Private && config.friendsAdmin)),
    );
  }
  tick() {
    if (this.root) this.root.hidden = !this.allowed();
  }
  getTickIntervalMs() {
    return 500;
  }
  onRendererDispose() {
    this.root?.remove();
  }
}
