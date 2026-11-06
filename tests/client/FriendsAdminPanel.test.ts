import { GameType } from "@openfront/engine-api/game/GameTypes";
import { afterEach, expect, test, vi } from "vitest";
vi.mock("../../src/client/Transport", () => ({
  FriendsAdminIntentEvent: class {
    constructor(public intent: unknown) {}
  },
}));
import type { EventBus } from "@openfront/shared/EventBus";
import { FriendsAdminPanel } from "../../src/client/controllers/FriendsAdminPanel";
import type { GameView } from "../../src/client/view";
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllEnvs();
});
test("dot is host-only, sends bounded intents and cleans up on exit", () => {
  vi.stubEnv("FRIENDS_STATIC", "true");
  let creator = false;
  const game = {
    myPlayer: () => ({ isAlive: () => true, isLobbyCreator: () => creator }),
    config: () => ({
      gameConfig: () => ({ gameType: GameType.Private, friendsAdmin: true }),
    }),
  };
  const emit = vi.fn(),
    controller = new FriendsAdminPanel(
      game as unknown as GameView,
      { emit } as unknown as EventBus,
    );
  controller.init();
  const root = document.querySelector<HTMLElement>(".friends-admin")!;
  expect(root.hidden).toBe(true);
  creator = true;
  controller.tick();
  expect(root.hidden).toBe(false);
  root.querySelector<HTMLButtonElement>(".friends-admin-dot")!.click();
  expect(root.querySelector("section")!.hidden).toBe(false);
  const amount = root.querySelector<HTMLInputElement>("input")!;
  amount.value = "1234";
  root
    .querySelector<HTMLButtonElement>(".friends-admin-actions button")!
    .click();
  expect(emit.mock.calls[0][0].intent).toMatchObject({
    type: "friends_admin",
    action: "gold",
    amount: 1234,
  });
  creator = false;
  root
    .querySelector<HTMLButtonElement>(".friends-admin-actions button")!
    .click();
  expect(emit).toHaveBeenCalledTimes(1);
  controller.onRendererDispose();
  expect(document.querySelector(".friends-admin")).toBeNull();
});
