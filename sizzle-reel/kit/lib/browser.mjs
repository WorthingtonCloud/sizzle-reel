// One place that finds a headless Chrome, so every script launches it the same way.
// Order: `puppeteer` (bundles its own Chrome) or `puppeteer-core` installed in the reel folder, then
// PUPPETEER_FROM (a package.json whose node_modules holds either one). Chrome for puppeteer-core comes from
// CHROME, else the usual install paths.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const CHROMES = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

export function findPuppeteer() {
  const bases = [path.join(process.cwd(), "package.json"), process.env.PUPPETEER_FROM].filter(Boolean);
  for (const base of bases) {
    for (const name of ["puppeteer", "puppeteer-core"]) {
      try { return { pp: createRequire(base)(name), name, base }; } catch {}
    }
  }
  return null;
}

export function findChrome() {
  return CHROMES.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

export async function launch() {
  const found = findPuppeteer();
  if (!found) {
    throw new Error("No puppeteer found. In the reel folder run: npm i puppeteer   (or set PUPPETEER_FROM to a package.json that has it)");
  }
  const opts = { headless: true, args: ["--hide-scrollbars", "--font-render-hinting=none"] };
  const chrome = findChrome();
  if (found.name === "puppeteer-core") {
    if (!chrome) throw new Error("puppeteer-core needs a Chrome: set CHROME=/path/to/chrome");
    opts.executablePath = chrome;
  } else if (process.env.CHROME) {
    opts.executablePath = process.env.CHROME;
  }
  return found.pp.launch(opts);
}

// reel.json is the single source of truth for every script.
export function loadReel(file = "reel.json") {
  if (!fs.existsSync(file)) throw new Error(`${file} not found — run from the reel folder`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function isLandscape(reel) {
  const [w, h] = reel.size;
  return w > h;
}
