import { GameType } from "@openfront/engine-api/game/GameTypes";
import type { WireGameStartInfo } from "@openfront/shared/WireSchemas";
import { expect, test } from "vitest";
import {
  parsePeerIntent,
  checkedPeerTurn,
  PeerInputLimiter,
  secureRoomStartInfo,
} from "../../src/client/FriendsFairPlay";
test("rooms cannot bypass protections by claiming to be a solo sandbox", () => {
  const config = {
    gameType: GameType.Singleplayer,
    infiniteGold: true,
    infiniteTroops: true,
    instantBuild: true,
    startingGold: 1000000000,
    hostCheats: { infiniteGold: true },
    friendsAdmin: true,
  };
  secureRoomStartInfo({ config } as WireGameStartInfo);
  expect(config.gameType).toBe(GameType.Private);
  expect(config.hostCheats).toBeUndefined();
  expect(config.infiniteGold).toBe(false);
  expect(config.startingGold).toBe(50000);
});
test("malformed, privileged and non-finite packets are rejected", () => {
  for (const packet of [
    "{",
    "null",
    "x".repeat(4097),
    {
      type: "friends_admin",
      action: "gold",
      amount: 1000000000,
      enabled: true,
    },
    { type: "update_game_config", config: { infiniteGold: true } },
    { type: "mark_disconnected", isDisconnected: true },
    { type: "toggle_pause", paused: true },
    { type: "spawn", tile: Infinity },
  ])
    expect(parsePeerIntent(packet, "host0001")).toBeNull();
});
test("valid actions use authenticated identity and lose injected fields", () => {
  const parsed = parsePeerIntent(
    { type: "spawn", tile: 42, clientID: "victim01", gold: 1000000000 },
    "guest001",
  );
  expect(parsed).toMatchObject({
    type: "spawn",
    tile: 42,
    clientID: "guest001",
  });
  expect(parsed).not.toHaveProperty("gold");
});
test("turn verification rejects grants, unknown actors, malformed histories and oversized batches", () => {
  const clients = new Set(["host0001", "guest001"]),
    spawn = { type: "spawn", tile: 42, clientID: "guest001" };
  expect(
    checkedPeerTurn({ turnNumber: 0, intents: [spawn] }, clients),
  ).not.toBeNull();
  for (const turn of [
    { turnNumber: -1, intents: [] },
    { turnNumber: 0, intents: [{ ...spawn, clientID: "victim01" }] },
    {
      turnNumber: 0,
      intents: [
        {
          type: "friends_admin",
          action: "gold",
          amount: 1,
          enabled: true,
          clientID: "host0001",
        },
      ],
    },
    { turnNumber: 0, intents: Array(129).fill(spawn) },
    null,
    "{",
  ])
    expect(checkedPeerTurn(turn, clients)).toBeNull();
});
test("input flooding is bounded per authenticated identity without blocking another player", () => {
  const gate = new PeerInputLimiter();
  for (let i = 0; i < 40; i++) expect(gate.allow("host0001", 0)).toBe(true);
  expect(gate.allow("host0001", 1)).toBe(false);
  expect(gate.allow("guest001", 1)).toBe(true);
  expect(gate.allow("host0001", 1000)).toBe(true);
});
