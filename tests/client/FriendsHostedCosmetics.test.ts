import { afterEach, expect, test, vi } from "vitest";
import { fetchCosmetics } from "../../src/client/Cosmetics";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
test("hosted default cosmetics need no unavailable server request", async () => {
  vi.stubEnv("FRIENDS_STATIC", "true");
  const fetch = vi.spyOn(globalThis, "fetch");
  expect(await fetchCosmetics()).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
