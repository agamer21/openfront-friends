import ejs from "ejs";
import { spawnSync, execFileSync } from "node:child_process";
import fs from "node:fs/promises";

// Vite bundles use the Pages project path; all map/audio/worker asset URLs
// use the same base, including assets fetched inside simulation workers.
const base = process.env.PAGES_BASE ?? "/openfront-friends/";
// A fork must serve its maps and previews from its own Pages origin.
const owner = process.env.GITHUB_REPOSITORY?.split("/")[0]?.toLowerCase();
const origin = process.env.PAGES_ORIGIN ?? (owner ? `https://${owner}.github.io` : "https://agamer21.github.io");
const cdnBase = `${origin}${base}`.replace(/\/$/, "");
const build = spawnSync(
  process.execPath,
  [process.env.npm_execpath, "run", "build-prod"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      FRIENDS_STATIC: "true",
      PAGES_BASE: base,
      CDN_BASE: cdnBase,
    },
  },
);
if (build.status !== 0) process.exit(build.status ?? 1);
const manifest = JSON.parse(
  await fs.readFile("static/asset-manifest.json", "utf8"),
);
const asset = (name) => `${cdnBase}${manifest[name] ?? `/${name}`}`;
const template = await fs.readFile("static/index.html", "utf8");
const html = ejs.render(template, {
  gitCommit: JSON.stringify(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  ),
  assetManifest: JSON.stringify(manifest),
  cdnBase: JSON.stringify(cdnBase),
  cdnBaseRaw: cdnBase,
  gameEnv: JSON.stringify("dev"),
  jwtAudience: JSON.stringify("localhost"),
  turnstileSiteKey: JSON.stringify("1x00000000000000000000AA"),
  // A static build has no multiplayer server to advertise.
  cluster: undefined,
  instanceLetter: undefined,
  instanceId: undefined,
  manifestHref: asset("manifest.json"),
  faviconHref: asset("images/Favicon.svg"),
  gameplayScreenshotUrl: asset("images/GameplayScreenshot.png"),
  backgroundImageUrl: asset("images/background.webp"),
  desktopLogoImageUrl: asset("images/OpenFront.png"),
  mobileLogoImageUrl: asset("images/OF.png"),
});
const style = `<style>desktop-nav-bar,mobile-nav-bar,steam-wishlist-button,steam-promo,game-mode-selector,news-box,streaming-now,steam-wishlist,featured-stream,homepage-promos,marketing-consent-toast,purchase-nudge-modal,nav-account-menu,store-modal,inventory-modal,leaderboard-modal,clan-modal,steam-link-modal,steam-handoff-modal{display:none!important}</style>`;
// No ad/analytics SDK is needed for the self-contained Pages edition.
const clean = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (script) =>
  /__loadThirdPartyScript\s*\(|googletagmanager\.com|adsbygoogle/.test(
    script,
  ) && !script.includes("window.__onPoki")
    ? ""
    : script,
);
await fs.writeFile(
  "static/index.html",
  clean.replace("</head>", `${style}</head>`),
);
await fs.writeFile("static/.nojekyll", "");
// Hash-based modal routes work on refresh; unknown paths return to the app.
await fs.writeFile(
  "static/404.html",
  `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${base}"><a href="${base}">Open OpenFront Friends</a>`,
);
console.log(`GitHub Pages build ready at ${base}`);
