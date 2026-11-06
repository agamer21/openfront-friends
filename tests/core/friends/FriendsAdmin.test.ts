import {
  GameType,
  UnitType,
  PlayerInfo,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import {
  FriendsAdminIntentSchema,
  type FriendsAdminIntent,
} from "@openfront/engine-api/Schemas";
import { Executor } from "@openfront/engine/execution/ExecutionManager";
import { applyFriendsAdmin } from "@openfront/engine/execution/FriendsAdmin";
import { expect, test } from "vitest";
import { setup } from "../../util/Setup";
import { expectSnapshotRoundTrip } from "../../util/Snapshot";

async function world(gameType = GameType.Private, enabled = true) {
  const game = await setup("big_plains", { gameType, friendsAdmin: enabled }, [
    new PlayerInfo("Host", PlayerType.Human, "host0001", "host", true),
    new PlayerInfo("Guest", PlayerType.Human, "guest001", "guest"),
  ]);
  const host = game.player("host"),
    guest = game.player("guest");
  host.conquer(game.ref(30, 30));
  host.setSpawnTile(game.ref(30, 30));
  guest.conquer(game.ref(70, 70));
  guest.setSpawnTile(game.ref(70, 70));
  return { game, host, guest };
}
const intent = (
  action: FriendsAdminIntent["action"],
  amount = 5000,
  enabled = true,
): FriendsAdminIntent => ({ type: "friends_admin", action, amount, enabled });

test("host grants follow stamped turn identity on both simulations", async () => {
  const a = await world(),
    b = await world();
  for (const w of [a, b]) {
    const gold = w.host.gold(),
      guestGold = w.guest.gold();
    const exec = new Executor(w.game, "admin-test", "host0001");
    exec.createExec({ ...intent("gold"), clientID: "host0001" });
    expect(w.host.gold()).toBe(gold + 5000n);
    exec.createExec({ ...intent("gold"), clientID: "guest001" });
    expect(w.guest.gold()).toBe(guestGold);
  }
  expect(a.host.gold()).toBe(b.host.gold());
  await expectSnapshotRoundTrip(a.game, "big_plains");
});
test("unlimited settings affect the host and can be switched off", async () => {
  const { game, host, guest } = await world();
  expect(applyFriendsAdmin(game, host, intent("infiniteGold"))).toBe(true);
  expect(game.config().unitInfo(UnitType.City).cost(game, host)).toBe(0n);
  expect(
    game.config().unitInfo(UnitType.City).cost(game, guest),
  ).toBeGreaterThan(0n);
  expect(applyFriendsAdmin(game, host, intent("infiniteTroops"))).toBe(true);
  expect(game.config().maxTroops(host)).toBeGreaterThan(
    game.config().maxTroops(guest),
  );
  await expectSnapshotRoundTrip(game, "big_plains");
  applyFriendsAdmin(game, host, intent("infiniteGold", 0, false));
  applyFriendsAdmin(game, host, intent("infiniteTroops", 0, false));
  expect(
    game.config().unitInfo(UnitType.City).cost(game, host),
  ).toBeGreaterThan(0n);
  expect(game.config().gameConfig().hostCheats?.infiniteTroops).toBe(false);
  await expectSnapshotRoundTrip(game, "big_plains");
});
test("public and non-admin private matches reject grants", async () => {
  for (const [type, enabled] of [
    [GameType.Public, true],
    [GameType.Private, false],
  ] as const) {
    const { game, host } = await world(type, enabled),
      before = host.gold();
    expect(applyFriendsAdmin(game, host, intent("gold"))).toBe(false);
    expect(host.gold()).toBe(before);
  }
});
test("solo grants work and malformed amounts are rejected", async () => {
  const { game, host } = await world(GameType.Singleplayer);
  expect(applyFriendsAdmin(game, host, intent("gold"))).toBe(true);
  for (const amount of [-1, Infinity, NaN, 1.5, 1_000_000_001]) {
    expect(
      FriendsAdminIntentSchema.safeParse(intent("gold", amount)).success,
    ).toBe(false);
    expect(applyFriendsAdmin(game, host, intent("gold", amount))).toBe(false);
  }
});
