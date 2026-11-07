import { ClientEnv } from "./ClientEnv";

export interface FriendsMatchError {
  message: string;
  gameID: string;
  nextTurn: number;
  version: string;
}

export function reportFriendsMatchError(
  message: string,
  gameID: string,
  nextTurn: number,
) {
  document.dispatchEvent(
    new CustomEvent<FriendsMatchError>("friends-online-error", {
      detail: { message, gameID, nextTurn, version: ClientEnv.gitCommit() },
    }),
  );
}
