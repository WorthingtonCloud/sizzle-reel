// Record smooth scroll shots of real web pages as JPEG frame sequences in rec/<shot>/.
// Deterministic, not a screen capture: each frame sets the scroll position, waits a tick, and takes a
// screenshot, so the motion is perfectly smooth and re-recording gives the same shot.
// Usage: node record.mjs [shot ...]   (no args = every shot in reel.json → "shots")
//
// A shot: { "url": "https://…", "anchor": "text that starts a heading" (optional), "from": 0, "to": 1200,
//           "frames": 90, "hide": [".cookie-banner", "#chat-widget"] (optional), "wait": 1200 (optional) }
// from/to are CSS pixels, measured from the anchor's top if there is one, else from the top of the page.
// Vertical reels record at phone size (390 wide @3x); widescreen at desktop size (1280 wide @1.5x).
// ⚠️ Scroll a shot's whole path once before recording it (this script does): pages that animate on scroll
// otherwise show half-built sections on the first pass.
import fs from "node:fs";
import { launch, loadReel, isLandscape } from "./lib/browser.mjs";

const reel = loadReel();
const LAND = isLandscape(reel);
const shots = reel.shots || {};
const want = process.argv.slice(2);
const names = want.length ? want : Object.keys(shots);
const b = await launch();
const page = await b.newPage();
await page.setViewport(LAND
  ? { width: 1280, height: 720, deviceScaleFactor: 1.5 }
  : { width: 390, height: Math.round(390 * reel.size[1] / reel.size[0]), deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const name of names) {
  const s = shots[name];
  if (!s) { console.error(`no shot "${name}" in reel.json`); continue; }
  await page.goto(s.url, { waitUntil: "networkidle2", timeout: 60000 });
  await page.addStyleTag({ content: `html{scroll-behavior:auto!important} ${(s.hide || []).map((h) => `${h}{display:none!important}`).join(" ")}` });
  await sleep(s.wait ?? 1200);
  let base = 0;
  if (s.anchor) {
    base = await page.evaluate((t) => {
      const el = [...document.querySelectorAll("h1,h2,h3,h4,p,span,a,figcaption,div,li")].find(
        (e) => e.children.length === 0 && e.textContent.trim().startsWith(t));
      return el ? el.getBoundingClientRect().top + window.scrollY : -1;
    }, s.anchor);
    if (base < 0) { console.error(`${name}: anchor not found: "${s.anchor}"`); continue; }
  }
  await page.evaluate((y) => window.scrollTo(0, y), base + s.to);
  await sleep(600);
  await page.evaluate((y) => window.scrollTo(0, Math.max(0, y)), base + s.from);
  await sleep(900);
  const dir = `rec/${name}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const n = s.frames || 90;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;  // ease in and out
    await page.evaluate((y) => window.scrollTo(0, Math.max(0, y)), base + s.from + (s.to - s.from) * e);
    await sleep(30);
    await page.screenshot({ path: `${dir}/f${String(i).padStart(4, "0")}.jpg`, type: "jpeg", quality: 92 });
  }
  fs.writeFileSync(`${dir}/shot.json`, JSON.stringify({ ...s, size: reel.size }));  // build.py re-records when this changes
  console.log(`${name}: ${n} frames → ${dir}/ (anchor y=${Math.round(base)})`);
}
await b.close();
