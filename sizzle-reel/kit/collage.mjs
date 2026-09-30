#!/usr/bin/env node
// Build the collage wall's tiles from the thing's OWN work: real postings (cover + kicker + title) and real visuals
// (charts, dashboards, diagrams, UI), sixteen different ones. Never frames of this reel: the Lab reel's wall once
// repeated its own scenes (three chats, three memory diagrams) and the note back was that it should showcase everything
// the thing has to offer (Sep 29, 2026). Tiles render at the reel's tile shape (9:16 vertical, 16:9 widescreen), in the
// reel's fonts and palette; then the grid segment lists them.
//
//   reel.json → "collage": {"out": "stills/collage", "tiles": [
//     {"cover": "src/covers/a.webp", "kicker": "FIELD REPORT NO. 001", "title": "What AI customer decisions should stand on"},
//     {"image": "src/vis/chart.jpg", "kicker": "INSTRUMENT · MODELS"},              a visual: empty margins trimmed, fitted
//     {"image": "src/vis/ui.webp", "kicker": "BUILD LOG NO. 005", "fill": true}]}    a visual that fills the whole tile
//   node collage.mjs    writes <out>/t01.jpg… and prints the "grid" list for the collage segment
//
// Lay the tiles out as a checkerboard (posting, visual, posting…) so no two neighbors are the same kind, and give every
// tile a different source. Capture sources at the reel's shape: phone width (390 @3x) for vertical, desktop (1280 @2x)
// for widescreen; hide fixed/sticky bars and "swipe to expand" hints; never a byline; never a page that says the
// closing line (the Lab's homepage headline IS its reel's last line). Record every capture script next to the reel.
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch, loadReel } from "./lib/browser.mjs";

const R = loadReel(), C = R.collage;
if (!C?.tiles?.length) { console.error('⛔ reel.json has no "collage": {"tiles": [...]} — see the top of collage.mjs'); process.exit(1); }
const [W, H] = R.size, LAND = W > H, TW = Math.round(W / 2), TH = Math.round(H / 2), P = R.palette;
const OUT = C.out || "stills/collage";
fs.mkdirSync(OUT, { recursive: true });
const url = (f) => pathToFileURL(path.resolve(f)).href;
const face = (f) => {  // the reel's own @font-face files, with their urls made absolute
  if (!f?.css || !fs.existsSync(f.css)) return "";
  const dir = path.dirname(path.resolve(f.css));
  return fs.readFileSync(f.css, "utf8").replace(/url\((?![a-z]+:)["']?([^)"']+)["']?\)/g, (_, u) => `url('${url(path.join(dir, u))}')`);
};
const SANS = R.font?.family || "system-ui", MONO = R.mono?.family || "monospace";
const CSS = `${face(R.font)}${face(R.mono)}
*{margin:0;padding:0;box-sizing:border-box}body{width:${TW}px;height:${TH}px;background:${P.card};overflow:hidden;font-family:"${SANS}",sans-serif;color:${P.ink}}
.k{font-family:"${MONO}",monospace;font-weight:700;font-size:${LAND ? 19 : 20}px;letter-spacing:.14em;color:${P.accent}}
.t{font-weight:800;letter-spacing:-.02em;line-height:1.07;text-wrap:balance}
.post .cv{position:absolute;left:0;top:0;width:100%;height:${LAND ? "100%" : `${Math.round(TH * 0.58)}px`};background-size:cover;background-position:center}
.post .fade{position:absolute;inset:0;background:${LAND ? `linear-gradient(to top,${P.ground}f5 0%,${P.ground}cc 30%,${P.ground}00 62%)` : `linear-gradient(to top,${P.card} 0%,${P.card} 42%,${P.card}00 44%)`}}
.post .txt{position:absolute;left:${LAND ? 44 : 36}px;right:${LAND ? 150 : 36}px;${LAND ? "bottom:40px" : `top:${Math.round(TH * 0.62)}px`}}
.post .t{margin-top:14px;font-size:${Math.round((LAND ? 40 : 38) * TW / (LAND ? 960 : 540))}px}
.vis .k{position:absolute;left:${LAND ? 40 : 36}px;top:${LAND ? 34 : 40}px}
.vis .im{position:absolute;left:${LAND ? 40 : 30}px;right:${LAND ? 40 : 30}px;top:${LAND ? 84 : 100}px;bottom:${LAND ? 30 : 40}px;background-size:contain;background-repeat:no-repeat;background-position:center}
.vis.fill .im{inset:0;background-size:cover}.vis.fill .k{z-index:2;background:${P.ground}e6;padding:8px 12px;border-radius:6px;left:${LAND ? 28 : 24}px;top:${LAND ? 24 : 28}px}`;

// Refuse the three ways a wall stops showcasing: the same picture twice, a frame of this reel, a page ruled out.
{
  const norm = (u) => String(u || "").replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();
  const NEVER = (R.never || []).map(norm), pics = new Map(), names = new Map(), bad = [];
  C.tiles.forEach((t, i) => {
    const src = t.cover || t.image, n = `tile ${i + 1}`;
    if (!src || !fs.existsSync(src)) return bad.push(`${n}: ${src} not found`);
    if (/^(out|comp|qa|rec)\//.test(path.relative(".", src).replace(/\\/g, "/"))) bad.push(`${n}: ${src} is this reel's own output — the wall shows the thing's work, not the reel`);
    const h = crypto.createHash("sha1").update(fs.readFileSync(src)).digest("hex");
    if (pics.has(h)) bad.push(`${n}: the same picture as tile ${pics.get(h)}`); else pics.set(h, i + 1);
    const name = `${t.kicker || ""}|${t.title || ""}`.toLowerCase();
    if (t.title && names.has(name)) bad.push(`${n}: the same posting as tile ${names.get(name)}`); else names.set(name, i + 1);
    if (t.from && NEVER.includes(norm(t.from))) bad.push(`${n}: captured from ${t.from}, which reel.json → "never" rules out`);
  });
  if (bad.length) { bad.forEach((m) => console.error(`⛔ ${m}`)); process.exit(1); }
}

const b = await launch(), pg = await b.newPage();
await pg.setViewport({ width: TW, height: TH, deviceScaleFactor: 2 });
// visuals go in as data: a file:// image taints the canvas the trim reads from
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif" };
const dataUrl = (f) => `data:${MIME[path.extname(f).toLowerCase()] || "image/png"};base64,${fs.readFileSync(f).toString("base64")}`;
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const grid = [];
for (const [i, t] of C.tiles.entries()) {
  const src = t.cover || t.image;
  const body = t.cover
    ? `<div class="post"><div class="cv" style="background-image:url('${url(src)}')"></div><div class="fade"></div><div class="txt"><div class="k">${esc(t.kicker)}</div><div class="t">${esc(t.title)}</div></div></div>`
    : `<div class="vis${t.fill ? " fill" : ""}"><div class="k">${esc(t.kicker)}</div><div class="im" data-src="${dataUrl(src)}"></div></div>`;
  // a real file:// page: a blank page's origin may not load local images or fonts
  const page = path.resolve(OUT, ".tile.html");
  fs.writeFileSync(page, `<html><head><style>${CSS}</style></head><body>${body}</body></html>`);
  await pg.goto(pathToFileURL(page).href, { waitUntil: "load" });
  await pg.evaluate(async (fill) => {
    await document.fonts.ready;
    const im = document.querySelector(".im"); if (!im) return;
    const img = await new Promise((r) => { const x = new Image(); x.onload = () => r(x); x.onerror = () => r(null); x.src = im.dataset.src; });
    if (!img) return;
    let out = img.src;
    if (!fill) {  // trim the empty page ground around a captured figure, so it fills its tile
      const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data, [r0, g0, b0] = [d[0], d[1], d[2]];
      let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
      for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
        const k = (y * c.width + x) * 4;
        if ((Math.abs(d[k] - r0) + Math.abs(d[k + 1] - g0) + Math.abs(d[k + 2] - b0)) / 3 > 18) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 > x0 && y1 > y0) {
        const pad = Math.round(0.03 * Math.max(c.width, c.height)); x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
        x1 = Math.min(c.width, x1 + pad); y1 = Math.min(c.height, y1 + pad);
        const t = document.createElement("canvas"); t.width = x1 - x0; t.height = y1 - y0;
        t.getContext("2d").drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height); out = t.toDataURL("image/png");
      }
    }
    im.style.backgroundImage = `url('${out}')`;
    await new Promise((r) => { const x = new Image(); x.onload = x.onerror = r; x.src = out; });
  }, !!t.fill);
  const file = path.join(OUT, `t${String(i + 1).padStart(2, "0")}.jpg`);
  await pg.screenshot({ path: file, type: "jpeg", quality: 90 });
  grid.push(file);
}
fs.rmSync(path.resolve(OUT, ".tile.html"), { force: true });
await b.close();
console.log(`${grid.length} tiles → ${OUT}/ (${TW}×${TH})${grid.length % 4 && grid.length % 3 ? "  ⚠️  fill every row of the wall" : ""}`);
console.log(`"grid": ${JSON.stringify(grid)}`);
