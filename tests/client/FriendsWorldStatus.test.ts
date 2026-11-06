import { afterEach, expect, test, vi } from "vitest";
import { FriendsWorldStatus } from "../../src/client/components/FriendsWorldStatus";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

test("world HUD skips paused ticks and hidden tabs, then catches up", async () => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  let tick = 100;
  const player = { numTilesOwned: () => 10, name: () => "Commander" };
  const players = vi.fn(() => [player]);
  const game = {
    myPlayer: () => player,
    inSpawnPhase: () => false,
    numLandTiles: () => 100,
    players,
    ticks: () => tick,
    config: () => ({
      gameConfig: () => ({}),
      numSpawnPhaseTurns: () => 10,
      percentageTilesOwnedToWinTenths: () => 800,
      hasExtendedSpawnImmunity: () => false,
    }),
  };
  const panel = Object.assign(document.createElement("control-panel"), {
    game,
  });
  const wrapper = document.createElement("div");
  wrapper.className = "in-game";
  wrapper.append(panel);
  document.body.append(wrapper);
  const hud = new FriendsWorldStatus();
  document.body.append(hud);
  const refresh = () => (hud as unknown as { refresh(): void }).refresh();
  refresh();
  await hud.updateComplete;
  expect(players).toHaveBeenCalledTimes(1);
  expect(hud.textContent).toContain("You 10.00%");
  for (let i = 0; i < 20; i++) refresh();
  expect(players).toHaveBeenCalledTimes(1);
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  tick++;
  refresh();
  expect(players).toHaveBeenCalledTimes(1);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  refresh();
  expect(players).toHaveBeenCalledTimes(2);
  // A new world with the same tick must not reuse the old cache.
  panel.game = { ...game };
  refresh();
  expect(players).toHaveBeenCalledTimes(3);
});
