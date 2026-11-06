import { GameType, PlayerType } from "@openfront/engine-api/game/GameTypes";
import {
  FriendsAdminIntentSchema,
  type FriendsAdminIntent,
} from "@openfront/engine-api/Schemas";
import type { Game, Player } from "../game/Game";

/** Called in turn order on every peer. Never accepts a caller-supplied target. */
export function applyFriendsAdmin(
  game: Game,
  player: Player,
  raw: FriendsAdminIntent,
): boolean {
  const parsed = FriendsAdminIntentSchema.safeParse(raw);
  const config = game.config().gameConfig();
  if (
    !parsed.success ||
    !player.isAlive() ||
    player.type() !== PlayerType.Human ||
    !player.isLobbyCreator()
  )
    return false;
  if (
    config.gameType !== GameType.Singleplayer &&
    !(config.gameType === GameType.Private && config.friendsAdmin)
  )
    return false;
  const { action, amount, enabled } = parsed.data;
  switch (action) {
    case "gold":
      player.addGold(BigInt(amount));
      break;
    case "troops":
      player.addTroops(amount);
      break;
    case "infiniteGold":
      config.hostCheats = { ...config.hostCheats, infiniteGold: enabled };
      if (enabled) player.addGold(1_000_000_000n);
      break;
    case "infiniteTroops":
      config.hostCheats = { ...config.hostCheats, infiniteTroops: enabled };
      if (enabled) player.addTroops(1_000_000);
      break;
  }
  return true;
}
