import { GameType } from "@openfront/engine-api/game/GameTypes";
import {
  IntentSchema,
  type StampedIntent,
  type Turn,
} from "@openfront/engine-api/Schemas";
import type { WireGameStartInfo } from "@openfront/shared/WireSchemas";

const forbidden = new Set([
  "friends_admin",
  "toggle_pause",
  "kick_player",
  "update_game_config",
  "change_game_mode",
  "toggle_game_start_timer",
  "mark_disconnected",
]);

/** A room cannot masquerade as a local sandbox to bypass multiplayer checks. */
export function secureRoomStartInfo(info: WireGameStartInfo): void {
  Object.assign(info.config, {
    gameType: GameType.Private,
    hostCheats: undefined,
    friendsAdmin: false,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    goldMultiplier: 1,
  });
  if (![0, 50_000, 500_000, 2_000_000].includes(info.config.startingGold ?? 0))
    info.config.startingGold = 50_000;
}

/** Identity comes from the authenticated input path, never from the packet. */
export function parsePeerIntent(
  value: unknown,
  clientID: string,
): StampedIntent | null {
  try {
    if (typeof value === "string") {
      if (value.length > 4096) return null;
      value = JSON.parse(value);
    }
    const result = IntentSchema.safeParse(value);
    if (!result.success || forbidden.has(result.data.type)) return null;
    return { ...result.data, clientID };
  } catch {
    return null;
  }
}

/** Reject an invalid ordered turn as a whole, rather than silently desync peers. */
export function checkedPeerTurn(
  value: unknown,
  clients: ReadonlySet<string>,
): Turn | null {
  try {
    if (typeof value === "string") {
      if (value.length > 65536) return null;
      value = JSON.parse(value);
    }
    if (!value || typeof value !== "object") return null;
    const turn = value as Turn;
    if (
      !Number.isSafeInteger(turn.turnNumber) ||
      turn.turnNumber < 0 ||
      !Array.isArray(turn.intents) ||
      turn.intents.length > 128
    )
      return null;
    const intents: StampedIntent[] = [];
    for (const intent of turn.intents) {
      if (
        !intent ||
        typeof intent.clientID !== "string" ||
        !clients.has(intent.clientID)
      )
        return null;
      const parsed = parsePeerIntent(intent, intent.clientID);
      if (!parsed) return null;
      intents.push(parsed);
    }
    return { ...turn, intents };
  } catch {
    return null;
  }
}

/** Bounded input queue and per-identity flood protection. */
export class PeerInputLimiter {
  private windows = new Map<string, { at: number; count: number }>();
  allow(clientID: string, now = Date.now()): boolean {
    const previous = this.windows.get(clientID);
    if (!previous || now - previous.at >= 1000) {
      this.windows.set(clientID, { at: now, count: 1 });
      return true;
    }
    return ++previous.count <= 40;
  }
}
