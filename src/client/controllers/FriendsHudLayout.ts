import type { Controller } from "../Controller";
import "../components/friends-hud-layout.css";

/** Put optional tools in one bounded drawer and reserve real measured HUD space. */
export class FriendsHudLayout implements Controller {
  private root?: HTMLDetailsElement;
  private observer?: ResizeObserver;
  private moved: { node: Element; parent: Node; next: ChildNode | null }[] = [];
  private scheduled = 0;
  init() {
    if (process.env.FRIENDS_STATIC !== "true") return;
    document.body.classList.add("friends-hud-managed");
    const root = (this.root = document.createElement("details"));
    root.className = "friends-game-tools";
    root.innerHTML =
      '<summary>Tools <span aria-hidden="true">☰</span></summary><div class="friends-tools-content"></div>';
    document.body.append(root);
    const content = root.querySelector("div")!;
    for (const selector of [
      ".ft-panel",
      "friends-chat",
      "friends-field-guide",
      ".arcade-return",
    ]) {
      const node = document.querySelector(selector);
      if (!node?.parentNode) continue;
      this.moved.push({
        node,
        parent: node.parentNode,
        next: node.nextSibling,
      });
      content.append(node);
    }
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
        if (event === "keydown" && (e as KeyboardEvent).key === "Escape") {
          root.open = false;
          root.querySelector<HTMLElement>("summary")?.focus();
        }
      });
    root.addEventListener("toggle", this.queue);
    window.addEventListener("resize", this.queue);
    window.visualViewport?.addEventListener("resize", this.queue);
    this.observer = new ResizeObserver(this.queue);
    for (const selector of [
      "#friends-control-dock",
      "friends-world-status",
      "tutorial-panel",
      "attacks-display",
      ".friends-mission-hud",
      "#friends-bottom-hud > div:last-child:not(#friends-hud-stack)",
    ]) {
      const node = document.querySelector(selector);
      if (node) this.observer.observe(node);
    }
    this.measure();
  }
  private queue = () => {
    if (!this.scheduled)
      this.scheduled = requestAnimationFrame(() => {
        this.scheduled = 0;
        this.measure();
      });
  };
  private measure() {
    if (!this.root) return;
    const h = window.visualViewport?.height ?? window.innerHeight;
    const dock = document
      .querySelector("#friends-control-dock")
      ?.getBoundingClientRect();
    const bottom = dock && dock.height > 0 ? Math.max(0, h - dock.top) : 80;
    const world = document
      .querySelector("friends-world-status")
      ?.getBoundingClientRect();
    let top = Math.max(52, world && world.height > 0 ? world.bottom : 52) + 12;
    document.body.style.setProperty(
      "--friends-world-bottom",
      `${Math.ceil(top)}px`,
    );
    for (const selector of [
      "attacks-display",
      ".friends-mission-hud",
      "#friends-bottom-hud > div:last-child:not(#friends-hud-stack)",
    ]) {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      if (box && box.height > 0 && box.top < h / 2)
        top = Math.max(top, box.bottom + 12);
    }
    document.body.style.setProperty(
      "--friends-hud-bottom",
      `${Math.ceil(bottom) + 12}px`,
    );
    document.body.style.setProperty("--friends-hud-top", `${Math.ceil(top)}px`);
    const tutorial = document
      .querySelector("tutorial-panel")
      ?.getBoundingClientRect();
    const sidebarTop = window.innerWidth <= 1100 ? Math.max(146, top) : 12;
    const sidebarBottom = Math.min(
      h - bottom,
      tutorial && tutorial.height > 0 ? tutorial.top - 12 : h - bottom,
    );
    document.body.style.setProperty(
      "--friends-sidebar-height",
      `${Math.max(0, Math.floor(sidebarBottom - sidebarTop))}px`,
    );
  }
  getTickIntervalMs() {
    return 500;
  }
  tick() {
    this.queue();
  }
  onRendererDispose() {
    this.observer?.disconnect();
    window.removeEventListener("resize", this.queue);
    window.visualViewport?.removeEventListener("resize", this.queue);
    if (this.scheduled) cancelAnimationFrame(this.scheduled);
    for (const item of this.moved)
      if (item.node.isConnected && item.parent.isConnected)
        item.parent.insertBefore(
          item.node,
          item.next?.parentNode === item.parent ? item.next : null,
        );
    this.root?.remove();
    document.body.classList.remove("friends-hud-managed");
    for (const property of [
      "--friends-hud-bottom",
      "--friends-hud-top",
      "--friends-world-bottom",
      "--friends-sidebar-height",
    ])
      document.body.style.removeProperty(property);
  }
}
