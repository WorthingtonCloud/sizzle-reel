// Render every on-screen title in reel.json as a transparent PNG the size of the video.
// Words are drawn by a browser, never by a video model: models garble text, and many ffmpeg builds have no
// drawtext filter anyway. Usage: node titles.mjs [id ...]   (no args = all)
//
// Kinds: "lower" = over footage, lower third · "card" = centered on the ground color, full frame ·
//        "scrim" (automatic) = a dark gradient behind lower titles on footage that has its own text.
// Markup: <br> breaks a line, <span class=a>…</span> paints a word in the accent color.
import fs from "node:fs";
import { launch, loadReel, fontCss, isLandscape } from "./lib/browser.mjs";

const reel = loadReel();
const [W, H] = reel.size;
const LAND = isLandscape(reel);
const P = reel.palette;
const FAM = reel.font?.family || "system-ui";
const titles = { ...reel.titles, scrim: { kind: "scrim" } };
const want = process.argv.slice(2);

// Portrait: lower titles sit in the lower-middle, full width. Landscape: bottom-left, picture on the right.
const lowerBox = LAND
  ? `left:${Math.round(W * 0.057)}px;bottom:${Math.round(H * 0.157)}px;width:${Math.round(W * 0.40)}px;font-size:${Math.round(H * 0.078)}px`
  : `left:${Math.round(W * 0.078)}px;right:${Math.round(W * 0.078)}px;top:${Math.round(H * 0.615)}px;font-size:${Math.round(W * 0.096)}px`;
const css = `
html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden}
body{font-family:"${FAM}",system-ui,sans-serif;color:${P.ink};-webkit-font-smoothing:antialiased}
.a{color:${P.accent}}
.lower{position:absolute;${lowerBox};font-weight:800;line-height:1.03;letter-spacing:-0.02em;
  text-shadow:0 4px 40px rgba(0,0,0,.85),0 2px 10px rgba(0,0,0,.9)}
.lower::before{content:"";display:block;width:.92em;height:.1em;background:${P.accent};margin-bottom:.38em}
.cardbg{position:absolute;inset:0;background:${P.ground}}
.card{position:absolute;left:6%;right:6%;top:50%;transform:translateY(-50%);text-align:center;font-weight:800;
  font-size:${Math.round(Math.min(W, H) * 0.118)}px;line-height:1.03;letter-spacing:-0.025em}
.scrim{position:absolute;inset:0;background:${LAND
  ? `linear-gradient(to right,${P.ground}f0 0%,${P.ground}d0 38%,${P.ground}00 52%)`
  : `linear-gradient(to bottom,${P.ground}00 38%,${P.ground}e0 56%,${P.ground}f0 80%,${P.ground}99 100%)`}}
`;

const b = await launch();
const p = await b.newPage();
await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
fs.mkdirSync("titles", { recursive: true });
let n = 0;
for (const [id, t] of Object.entries(titles)) {
  if (want.length && !want.includes(id)) continue;
  const body = t.kind === "lower" ? `<div class=lower>${t.text}</div>`
    : t.kind === "card" ? `<div class=cardbg></div><div class=card>${t.text}</div>`
    : t.kind === "scrim" ? `<div class=scrim></div>` : null;
  if (!body) { console.log(`  skip ${id}: unknown kind "${t.kind}"`); continue; }
  const f = `${process.cwd()}/titles/_page.html`;
  fs.writeFileSync(f, `<html><head><style>${fontCss(reel)}${css}</style></head><body>${body}</body></html>`);
  await p.goto("file://" + f, { waitUntil: "load" });
  await p.evaluate(async (fam) => { await document.fonts.load(`800 100px "${fam}"`); await document.fonts.ready; }, FAM);
  // A title wider than its box wraps into the picture or runs off the edge. Say so rather than ship it.
  const over = await p.evaluate(() => [...document.querySelectorAll(".lower,.card")].some((e) => e.scrollWidth > e.clientWidth + 2));
  if (over) console.log(`  ⚠️  ${id} is wider than its box — shorten it or add a <br>`);
  await p.screenshot({ path: `titles/${id}.png`, omitBackground: true });
  n++;
}
const fontOk = await p.evaluate((fam) => document.fonts.check(`800 100px "${fam}"`), FAM);
if (!fontOk && FAM !== "system-ui") console.log(`  ⚠️  font "${FAM}" did not load — run: node fonts.mjs "${FAM}"`);
console.log(`titles: ${n} rendered at ${W}x${H}`);
await b.close();
