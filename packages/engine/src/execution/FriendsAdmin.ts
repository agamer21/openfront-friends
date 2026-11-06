import type { FriendsAdminIntent } from "@openfront/engine-api/Schemas";
import type { Game, Player } from "../game/Game";
/** Compatibility tombstone: resource-grant commands are permanently disabled. */
export function applyFriendsAdmin(
  _game: Game,
  _player: Player,
  _intent: FriendsAdminIntent,
): boolean {
  return false;
}
