import {
  GameType,
  PlayerInfo,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import { Executor } from "@openfront/engine/execution/ExecutionManager";
import { applyFriendsAdmin } from "@openfront/engine/execution/FriendsAdmin";
import { expect, test } from "vitest";
import { setup } from "../../util/Setup";
test("all legacy resource grants are rejected, even for a solo or private host", async () => {
  for (const gameType of [GameType.Singleplayer, GameType.Private]) {
    const game = await setup("big_plains", { gameType, friendsAdmin: true }, [
      new PlayerInfo("Host", PlayerType.Human, "host0001", "host", true),
    ]);
    const host = game.player("host"),
      before = host.gold();
    const intent = {
      type: "friends_admin",
      action: "gold",
      amount: 1000000,
      enabled: true,
    } as const;
    expect(applyFriendsAdmin(game, host, intent)).toBe(false);
    new Executor(game, "testgame", "host0001").createExec({
      ...intent,
      clientID: "host0001",
    });
    expect(host.gold()).toBe(before);
  }
});
test("private games neutralize injected host privileges and invalid starting resources", async () => {
  const game = await setup("big_plains", {
    gameType: GameType.Private,
    infiniteGold: true,
    infiniteTroops: true,
    instantBuild: true,
    startingGold: 999999999,
    hostCheats: {
      infiniteGold: true,
      infiniteTroops: true,
      goldMultiplier: 1000,
    },
  });
  const cfg = game.config().gameConfig();
  expect(cfg.hostCheats).toBeUndefined();
  expect(cfg.infiniteGold).toBe(false);
  expect(cfg.infiniteTroops).toBe(false);
  expect(cfg.instantBuild).toBe(false);
  expect(cfg.startingGold).toBe(50000);
});
