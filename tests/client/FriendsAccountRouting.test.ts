import { afterEach, expect, test, vi } from "vitest";
vi.mock("../../src/client/FriendsAccount", () => ({
  openFriendsAccount: vi.fn(async () => {}),
}));
import { googleLogin, discordLogin, steamLogin } from "../../src/client/Auth";
import { openFriendsAccount } from "../../src/client/FriendsAccount";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
test("hosted provider logins use Firebase and never navigate to the server API", () => {
  vi.stubEnv("FRIENDS_STATIC", "true");
  const url = location.href;
  googleLogin();
  expect(openFriendsAccount).toHaveBeenLastCalledWith(true);
  discordLogin();
  expect(openFriendsAccount).toHaveBeenLastCalledWith(false);
  steamLogin();
  expect(openFriendsAccount).toHaveBeenCalledTimes(3);
  expect(location.href).toBe(url);
});
