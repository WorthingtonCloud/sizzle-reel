// Render one code-drawn scene from motion.html to a JPEG frame sequence in rec/<scene>/.
// Usage: node render_motion.mjs <scene> <seconds>      e.g.  node render_motion.mjs hub 7.5
// build.py calls this for you when a scene's frames are missing or the wrong length.
import fs from "node:fs";
import path from "node:path";
import { launch, loadReel, fontCss } from "./lib/browser.mjs";

const [scene, secs] = process.argv.slice(2);
if (!scene || !secs) { console.error("usage: node render_motion.mjs <scene> <seconds>"); process.exit(1); }
const reel = loadReel();
const FPS = reel.fps || 30, n = Math.round(Number(secs) * FPS);
const [W, H] = reel.size;
const logoFile = scene === "endcard" ? reel.scenes?.endcard?.logo : null;
// Passed in as a data URL: a file:// image drawn on the canvas would taint it and block the frame export.
let logo = null;
if (logoFile) {
  const ext = path.extname(logoFile).slice(1).toLowerCase();
  const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  logo = `data:${mime};base64,${fs.readFileSync(logoFile).toString("base64")}`;
}

const b = await launch();
const p = await b.newPage();
await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await p.goto("file://" + path.resolve("motion.html"), { waitUntil: "load" });
const fam = reel.font?.family || "system-ui";
await p.evaluate(async (css, fam) => {
  document.getElementById("fonts").textContent = css;
  for (const w of [500, 600, 700, 800]) await document.fonts.load(`${w} 40px "${fam}"`);
  await document.fonts.ready;
}, fontCss(reel), fam);
const known = await p.evaluate(() => window.scenes);
if (!known.includes(scene)) { console.error(`no scene "${scene}" in motion.html (have: ${known.join(", ")})`); await b.close(); process.exit(1); }
await p.evaluate((r, d, l) => window.setup(r, d, l), reel, Number(secs), logo);
const dir = `rec/${scene}`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
for (let i = 0; i < n; i++) {
  const url = await p.evaluate((s, t) => { window.draw(s, t); return window.frame(); }, scene, i / FPS);
  fs.writeFileSync(`${dir}/f${String(i).padStart(4, "0")}.jpg`, Buffer.from(url.split(",")[1], "base64"));
}
console.log(`${scene}: ${n} frames → ${dir}/`);
await b.close();
