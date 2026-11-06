/** All hosted-edition account entry points use our Firebase account system. */
export async function openFriendsAccount(google = false): Promise<void> {
  await import("./components/FriendsOnline");
  let panel =
    document.querySelector<import("./components/FriendsOnline").FriendsOnline>(
      "friends-online",
    );
  if (!panel) {
    panel = document.createElement(
      "friends-online",
    ) as import("./components/FriendsOnline").FriendsOnline;
    document.body.appendChild(panel);
  }
  panel.openAccount(google);
}
