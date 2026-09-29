#!/usr/bin/env node
// Build the reel from reel.json as ONE HyperFrames composition (comp/index.html + reel.js), check it, render it.
// Nothing here spends money. Re-run end to end any time; footage and music are only re-cut when their inputs change.
//
//   node build.mjs                 prepare, lint, check the safe zone, render out/<name>-v<N>.mp4 + cover + cuts
//   node build.mjs --storyboard    prepare and lint, then snapshot hero frames to qa/storyboard/ (seconds, no render):
//                                  LOOK at it before paying the render's time, fix, repeat
//   node build.mjs --no-render     prepare and check only
//
// Segment shape (reel.json → "segments"):
//   {"name": "s02_hub", "beats": 12, "in": "whip", "source": {"scene": "hub"}, "titles": [["t_layers", 0, 6], ["t_plugged", 6, "end"]]}
// Length: "beats": n (on the grid) · "secs": x · "to_hit": true (runs until the music's first big hit).
// Title times use the segment's own unit ("end" = the segment's end).
// "in" (how this segment arrives): whip (default) · zoom · dot · flash · fade · cut.
// Sources:
//   {"scene": "chat" | "hub" | "sources" | "endcard"}   drawn in code (reel.js), words from reel.json → "scenes"
//   {"shot": "home", "inset": 0.78}                      a real page in a framed panel (reel.json → "shots": a url that
//                                                        record.mjs scrolls, or a "video" / "dir" of frames you recorded)
//   {"clip": "clips/x.mp4", "ss": 0, "speed": 1}         a video clip (generated, or your own footage)
//   {"still": "stills/x.jpg"}                            a still with a slow push-in ("push" on the segment sets how far)
//   {"card": "t_title", "at": [0, 1, 2]}                 a full-frame title card; "at" = beat each line arrives on
//   {"grid": ["@5.2", "stills/a.jpg", "clips/b.mp4@1.5"]} tiles popping on, a third of a beat apart;
//                                                        "@t" = a frame of THIS reel at t seconds
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { launch, loadReel } from "./lib/browser.mjs";

const ARGS = process.argv.slice(2), STORY = ARGS.includes("--storyboard"), NORENDER = ARGS.includes("--no-render") || STORY;
const R = loadReel(), [W, H] = R.size, FPS = R.fps || 30, LAND = W > H, P = R.palette;
const M = R.music, B = +M.beat, HIT = +M.first_hit;
const COMP = "comp", A = `${COMP}/assets`, OUT = `out/${R.name}-v${R.version || 1}.mp4`;
for (const d of [A, `${A}/tiles`, `${A}/fonts`, "out", "qa"]) fs.mkdirSync(d, { recursive: true });
const env = { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1", HYPERFRAMES_SKIP_SKILLS: "1" };
const die = (msg) => { console.error(`⛔ ${msg}`); process.exit(1); };
const run = (cmd, args, opts = {}) => { const r = spawnSync(cmd, args, { stdio: "inherit", env, ...opts }); if (r.status !== 0) die(`${cmd} ${args.slice(0, 3).join(" ")} … failed`); };
const ff = (...a) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a]);
const hf = (args) => run(process.platform === "win32" ? "npx.cmd" : "npx", ["--no-install", "hyperframes", ...args], { cwd: COMP });
const probe = (f) => +spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout.trim();
const r3 = (x) => Math.round(x * 1000) / 1000;
const hex6 = (c) => /^#[0-9a-f]{3}$/i.test(c) ? "#" + [...c.slice(1)].map((x) => x + x).join("") : c;
for (const k in P) P[k] = hex6(P[k]);

// Only redo work whose inputs changed: each output keeps a small .key file describing what made it.
const fresh = (out, key) => fs.existsSync(out) && fs.existsSync(out + ".key") && fs.readFileSync(out + ".key", "utf8") === key;
const stamp = (out, key) => fs.writeFileSync(out + ".key", key);
const mtime = (f) => fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0;
const copy = (from, to) => { if (!fs.existsSync(from)) die(`${from} not found`); if (mtime(to) < mtime(from) || fs.statSync(to).size !== fs.statSync(from).size) fs.copyFileSync(from, to); };

// ───────── timing: every segment on the music's grid ─────────
let t = 0;
const SEGS = R.segments.map((seg, i) => {
  const unit = seg.to_hit || seg.secs != null ? 1 : B;
  const len = seg.to_hit ? HIT - t : seg.secs != null ? +seg.secs : +seg.beats * B;
  if (!(len > 0)) die(`${seg.name}: length ${len}s (a to_hit segment must come before the hit)`);
  const s = { name: seg.name, t0: r3(t), t1: r3(t + len), in: i ? seg.in || "whip" : "cut", source: seg.source, push: seg.push, scrim: seg.scrim,
    titles: (seg.titles || []).map(([id, a, b]) => ({ id, t0: r3(t + a * unit), t1: r3(b === "end" ? t + len : t + b * unit) })) };
  t += len;
  return s;
});
const END = r3(t);

// ───────── the music: one track, trimmed to the cut, faded only at the very end ─────────
const offset = +(M.offset || 0), fade = +(M.fade ?? 2.2), mlen = probe(M.file);
if (mlen < offset + END - 0.05) die(`the music is ${mlen.toFixed(1)}s but the cut needs ${(offset + END).toFixed(1)}s. Shorten the cut, replay whole bars, or extend the track.`);
const bedKey = `${M.file}|${mtime(M.file)}|${offset}|${END}|${fade}`;
if (!fresh(`${A}/bed.wav`, bedKey)) {
  ff("-ss", String(offset), "-i", M.file, "-t", String(END), "-af", `afade=t=out:st=${Math.max(0, END - fade)}:d=${fade}`, "-ar", "48000", "-ac", "2", `${A}/bed.wav`);
  stamp(`${A}/bed.wav`, bedKey);
}

// ───────── footage: page recordings, clips and stills become media files sized to their slot ─────────
const frames = (d) => fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /^f\d+\.jpg$/.test(f)).sort() : [];
const media = { tiles: {}, logo: null };
const segHTML = SEGS.map((seg, i) => {
  const src = seg.source, len = seg.t1 - seg.t0, v = (file) =>
    `<video id="v${i}" src="${file}" muted playsinline data-start="${seg.t0}" data-duration="${r3(len)}" data-track-index="${i + 1}"></video>`;
  let inner = "", footage = false;
  if (src.shot) {
    const shot = (R.shots || {})[src.shot]; if (!shot) die(`${seg.name}: no shot "${src.shot}" in reel.json → shots`);
    // "video": your own screen recording · "dir": a folder of f0000.jpg… · otherwise record.mjs records the url,
    // and re-records when the shot's entry (url, range, frames…) or the reel's size changed
    const dir = shot.dir || `rec/${src.shot}`, out = `${A}/shot-${src.shot}-${i}.mp4`, scale = `scale=${LAND ? 1920 : 1080}:-2:flags=lanczos`;
    if (shot.video) {
      const key = `${shot.video}|${mtime(shot.video)}|${shot.ss || 0}|${len}`;
      if (!fresh(out, key)) {
        ff("-ss", String(shot.ss || 0), "-i", shot.video, "-vf", `fps=${FPS},${scale},tpad=stop_mode=clone:stop_duration=30,format=yuv420p`,
          "-an", "-c:v", "libx264", "-crf", "16", "-t", String(len + 0.5), out);
        stamp(out, key);
      }
    } else {
      if (!shot.dir) {
        const want = JSON.stringify({ ...shot, size: R.size });
        const have = fs.existsSync(`${dir}/shot.json`) ? JSON.stringify(JSON.parse(fs.readFileSync(`${dir}/shot.json`, "utf8"))) : null;
        if (!frames(dir).length || have !== want) run("node", ["record.mjs", src.shot]);
      }
      const n = frames(dir).length, key = `${dir}|${n}|${len}|${mtime(`${dir}/${frames(dir)[0]}`)}|${mtime(`${dir}/shot.json`)}`;
      if (!n) die(`${seg.name}: no frames in ${dir}`);
      if (!fresh(out, key)) {  // stretch or squeeze the recorded frames to fill the slot exactly
        ff("-framerate", (n / len).toFixed(5), "-start_number", "0", "-i", `${dir}/f%04d.jpg`, "-vf",
          `fps=${FPS},${scale},tpad=stop_mode=clone:stop_duration=0.5,format=yuv420p`, "-c:v", "libx264", "-crf", "16", "-t", String(len + 0.5), out);
        stamp(out, key);
      }
    }
    // A real page runs its text to its own edges, and phones crop ~9% off each side of a vertical video:
    // the page sits in a framed panel at 78% so its words survive. Widescreen: a panel on the right.
    const inset = src.inset ?? shot.inset ?? R.shot_inset ?? 0.78;
    const [mw, mh] = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", out], { encoding: "utf8" }).stdout.trim().split(",").map(Number);
    const lh = Math.min(H * 0.8, W * 0.52 * mh / mw);  // widescreen: the page's own shape, right side, never cropped to 16:9
    const box = LAND ? { w: lh * mw / mh, h: lh, x: W * 0.96 - lh * mw / mh } : { w: W * inset, h: H * inset, x: W * (1 - inset) / 2 };
    const radius = inset >= 1 && !LAND ? 0 : 34;
    inner = `<div class="panel" style="left:${r3(box.x)}px;top:${r3((H - box.h) / 2)}px;width:${r3(box.w)}px;height:${r3(box.h)}px;border-radius:${radius}px">${v(path.relative(COMP, out))}</div>`;
    footage = true;
  } else if (src.clip) {
    const out = `${A}/clip-${i}.mp4`, sp = src.speed || 1, key = `${src.clip}|${mtime(src.clip)}|${src.ss || 0}|${sp}|${len}`;
    if (!fresh(out, key)) {
      ff("-ss", String(src.ss || 0), "-i", src.clip, "-vf", `setpts=(PTS-STARTPTS)/${sp},fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,tpad=stop_mode=clone:stop_duration=30,format=yuv420p`,
        "-an", "-c:v", "libx264", "-crf", "16", "-t", String(len + 0.5), out);
      stamp(out, key);
    }
    inner = `<div class="full">${v(path.relative(COMP, out))}</div>`; footage = true;
  } else if (src.still) {
    const out = `${A}/still-${i}${path.extname(src.still)}`; copy(src.still, out);
    inner = `<div class="full"><img src="${path.relative(COMP, out)}" alt=""></div>`; footage = true;
  }
  const words = seg.titles.some((tt) => ["lower", "stat", undefined].includes(R.titles[tt.id]?.kind));
  const scrim = footage && words && seg.scrim !== false ? `<div class="scrim"></div>` : "";
  return `<div class="seg" id="seg-${i}"><div class="cam">${inner}</div>${scrim}</div>`;
});

// grid tiles: files, frames of clips ("clip.mp4@1.5"), or frames of this very reel ("@5.2", snapshotted below)
const snapTimes = [];
SEGS.forEach((seg, i) => {
  if (!seg.source.grid) return;
  if (seg.source.grid.length % 3) console.log(`  ⚠️  ${seg.name}: ${seg.source.grid.length} tiles leaves a gap in a 3-wide grid — an unfilled grid reads as a mistake`);
  media.tiles[i] = seg.source.grid.map((g, k) => {
    const out = `${A}/tiles/g${i}-${k}.jpg`, [file, at] = g.split("@");
    if (!file) snapTimes.push({ at: +at, out });
    else if (at != null) { const key = `${file}|${mtime(file)}|${at}`; if (!fresh(out, key)) { ff("-ss", at, "-i", file, "-frames:v", "1", "-vf", `scale=${Math.round(W / 2)}:-2`, "-q:v", "3", out); stamp(out, key); } }
    else ff("-i", file, "-vf", `scale=${Math.round(W / 2)}:-2`, "-q:v", "3", out);
    return path.relative(COMP, out);
  });
});

// fonts: @font-face from the css fonts.mjs wrote, files copied next to the composition (never a remote @import)
const fontFace = (f) => {
  if (!f?.css || !fs.existsSync(f.css)) return "";
  const dir = path.dirname(f.css);
  return fs.readFileSync(f.css, "utf8").replace(/url\((?![a-z]+:)["']?([^)"']+)["']?\)/g, (_, u) => { copy(path.join(dir, u), `${A}/fonts/${path.basename(u)}`); return `url('assets/fonts/${path.basename(u)}')`; });
};
const SANS = R.font?.family || "system-ui", MONO = R.mono?.family || "monospace";
const faces = fontFace(R.font) + fontFace(R.mono);
if (!faces && R.font?.family) console.log(`  ⚠️  no font css for "${R.font.family}": run node fonts.mjs "${R.font.family}" (else the render falls back to a system font)`);
const logo = R.scenes?.endcard?.logo;
if (logo && fs.existsSync(logo)) { media.logo = `assets/logo${path.extname(logo)}`; copy(logo, `${COMP}/${media.logo}`); }
else if (logo && !R.scenes?.endcard?.mark) console.log(`  ⚠️  logo "${logo}" not found — end card drawn without it`);

const gsapFile = ["node_modules/gsap/dist/gsap.min.js", ...(process.env.PUPPETEER_FROM ? [path.join(path.dirname(process.env.PUPPETEER_FROM), "node_modules/gsap/dist/gsap.min.js")] : [])].find((f) => fs.existsSync(f));
if (!gsapFile) die("gsap not installed: in the reel folder run npm install");
copy(gsapFile, `${COMP}/gsap.min.js`);

// ───────── the composition ─────────
// The data and reel.js go in ONE inline script: HyperFrames' compiler reorders separate scripts, and a runtime that
// ran before its data painted 27 black storyboard frames (Sep 29).
const pct = (f, n) => r3(f * n);
const lowerBox = LAND ? `left:${pct(0.057, W)}px;bottom:${pct(0.157, H)}px;width:${pct(0.4, W)}px;font-size:${pct(0.078, H)}px`
  : `left:${pct(0.11, W)}px;right:${pct(0.2, W)}px;top:${pct(0.615, H)}px;font-size:${pct(0.083, W)}px`;
const statBox = LAND ? `left:${pct(0.057, W)}px;bottom:${pct(0.157, H)}px` : `left:${pct(0.11, W)}px;top:${pct(0.6, H)}px`;
const CSS = `${faces}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${P.ground}}
#root{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:${P.ground};font-family:"${SANS}",sans-serif;color:${P.ink}}
.mono{font-family:"${MONO}",monospace}.sans{font-family:"${SANS}",sans-serif}
.seg{position:absolute;inset:0;opacity:0}#seg-0{opacity:1}
.cam{position:absolute;inset:0}.stage{position:absolute;left:0;top:0;width:1080px;height:1400px;transform-origin:0 0}
#paper{position:absolute;inset:-120px;${(R.finish?.texture ?? "dots") === "dots" ? `background-image:radial-gradient(${P.card} 1.7px,transparent 2px);background-size:60px 60px` : ""}}
.vignette{position:absolute;inset:0;pointer-events:none;${R.finish?.vignette === false ? "" : "background:radial-gradient(ellipse 85% 70% at 50% 42%,transparent 55%,rgba(0,0,0,.5) 100%)"}}
.grain{position:absolute;left:0;top:0;width:${W}px;height:${H}px;opacity:0;mix-blend-mode:overlay}
.lower,.stat{position:absolute;opacity:0;text-shadow:0 4px 40px rgba(0,0,0,.85),0 2px 10px rgba(0,0,0,.9)}
.lower{${lowerBox};font-weight:800;line-height:1.03;letter-spacing:-.02em}
.lower .rule{display:block;width:.92em;height:.1em;background:${P.accent};margin-bottom:.38em;transform-origin:left center}
.stat{${statBox}}.stat .num{font-weight:800;font-size:${LAND ? pct(0.17, H) : pct(0.185, W)}px;line-height:.9;letter-spacing:-.035em;font-variant-numeric:tabular-nums}
.stat .sub{margin-top:.45em;font-weight:600;font-size:${LAND ? pct(0.042, H) : pct(0.046, W)}px;line-height:1.12;color:${P.ink};opacity:.82}
.line{display:block;white-space:nowrap}.w{display:inline-block}.ch{display:inline-block}.a{color:${P.accent}}
.cardwrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 ${LAND ? pct(0.06, W) : pct(0.11, W)}px}
.card{text-align:center;font-weight:800;font-size:${pct(0.118, Math.min(W, H))}px;line-height:1.03;letter-spacing:-.025em}
.panel{position:absolute;overflow:hidden;border:2px solid ${P.line};box-shadow:0 40px 100px rgba(0,0,0,.65);background:#000}
.full{position:absolute;inset:0}.panel video,.full video,.full img{width:100%;height:100%;object-fit:cover;display:block}
.scrim{position:absolute;inset:0;background:${LAND ? `linear-gradient(to right,${P.ground}f0 0%,${P.ground}d0 38%,${P.ground}00 52%)` : `linear-gradient(to bottom,${P.ground}00 40%,${P.ground}e0 57%,${P.ground}f2 80%,${P.ground}b3 100%)`}}
.chat{position:absolute;left:120px;top:250px;width:840px;height:840px;background:${P.card};border:3px solid ${P.line};border-radius:40px;overflow:hidden}
.chat-h{height:120px;border-bottom:3px solid ${P.line};display:flex;align-items:center;padding:0 48px;font-weight:600;font-size:34px;color:${P.dim}}
.chat-b{padding:48px;display:flex;flex-direction:column;gap:34px}
.bub-q{align-self:flex-end;max-width:600px;background:${P.ink};color:${P.ground};font-weight:600;font-size:34px;padding:18px 30px;border-radius:40px}
.bub-a{max-width:660px;font-weight:500;font-size:38px;line-height:1.3}
.chat-in{position:absolute;left:36px;right:36px;bottom:38px;height:92px;border:3px solid ${P.line};border-radius:46px;display:flex;align-items:center;padding:0 30px;font-weight:500;font-size:30px;color:${P.dim}}
.caret{width:4px;height:40px;background:${P.ink};margin-right:10px}
.send{position:absolute;right:16px;top:15px;width:56px;height:56px;border-radius:50%;background:${P.accent}}
.claim{position:absolute;left:120px;top:260px;width:840px;height:250px;background:${P.card};border:3px solid ${P.line};border-radius:24px}
.claim .k{position:absolute;left:40px;top:30px;font-size:24px;font-weight:700;letter-spacing:.2em;color:${P.accent}}
.bar{position:absolute;left:40px;height:20px;border-radius:10px;background:${P.ink};opacity:.18}
.src{position:absolute;width:262px;height:200px;background:${P.card};border:3px solid ${P.line};border-radius:20px}
.src .k{position:absolute;left:22px;top:18px;font-size:18px;letter-spacing:.18em;color:${P.dim}}
.src svg{position:absolute;left:50%;top:58px;margin-left:-32px}.src .t{position:absolute;left:22px;bottom:18px;font-size:30px;font-weight:700}
.tile{position:absolute;border-radius:16px;overflow:hidden;border:2px solid ${P.line};opacity:0}.tile img{width:100%;height:100%;object-fit:cover;display:block}
.tileicon{position:absolute;left:420px;top:455px;width:240px;height:240px;background:${P.card};border:3px solid ${P.line};border-radius:56px;overflow:hidden}
.tileicon .logo{position:absolute;inset:36px}.tileicon .logo img{width:100%;height:100%;object-fit:contain}
.word{position:absolute;left:0;right:0;top:755px;text-align:center;font-weight:800;font-size:112px;letter-spacing:.01em;opacity:0}
.url{position:absolute;left:0;right:0;top:895px;text-align:center;font-weight:500;font-size:40px;color:${P.dim};opacity:0}
#dot,#ring{position:absolute;left:0;top:0;width:56px;height:56px;border-radius:50%;opacity:0}#dot{background:${P.accent}}#ring{border:4px solid ${P.accent}}`;

const REEL = { size: R.size, fps: FPS, palette: P, beat: B, end: END, finish: R.finish, titles: R.titles, scenes: R.scenes || {}, media,
  segments: SEGS.map(({ name, t0, t1, in: inn, source, push, titles }) => ({ name, t0, t1, in: inn, source, push, titles })) };
fs.writeFileSync(`${COMP}/index.html`, `<!doctype html>
<!-- Written by build.mjs from reel.json. Edit reel.json (or the kit's reel.js), never this file. -->
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=${W}, height=${H}">
<script src="gsap.min.js"></script>
<style>${CSS}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${END}" data-width="${W}" data-height="${H}">
<audio id="bed" src="assets/bed.wav" data-start="0" data-duration="${END}" data-track-index="30" data-volume="1"></audio>
<div id="paper"></div>
${segHTML.join("\n")}
<div id="dot"></div><div id="ring"></div><div class="vignette"></div><div id="titles"></div><div id="grain"></div>
</div>
<script>
window.REEL = ${JSON.stringify(REEL)};
${fs.readFileSync(new URL("./reel.js", import.meta.url), "utf8")}
window.__timelines = window.__timelines || {};
window.__timelines["main"] = window.__reelTimeline;
</script>
</body></html>
`);
fs.writeFileSync(OUT.replace(".mp4", ".cuts.json"), JSON.stringify(SEGS.map(({ name, t0, t1, in: inn, source }) => ({ name, t0, t1, in: inn, kind: Object.keys(source)[0] })), null, 1));
console.log(`composition: ${COMP}/index.html  (${SEGS.length} segments, ${END.toFixed(2)}s)`);
SEGS.forEach((s) => console.log(`  ${s.t0.toFixed(2).padStart(6)}–${s.t1.toFixed(2).padStart(6)}  ${s.in.padEnd(5)} ${s.name}`));
hf(["lint"]);

// ───────── words vs the phone safe zone, and titles wider than their box ─────────
{
  const b = await launch(), p = await b.newPage();
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(pathToFileURL(path.resolve(COMP, "index.html")).href, { waitUntil: "load" });
  if (errs.length) die(`reel.js failed in the browser: ${errs[0]}`);
  const found = await p.evaluate((W, H, LAND) => {
    const S = { l: 0.11, r: 0.89, t: 0.10, b: 0.84, railX: 0.80, railY: 0.62 }, out = [], e = 2;  // 2px: words set ON the line are inside
    const check = (name, el) => {
      // measure where each word ENDS UP: clear the entrance tweens' start state (a card line waits at 1.4× scale)
      el.querySelectorAll(".line,.w,.num,.sub").forEach((e) => { e.style.transform = "none"; e.style.filter = "none"; });
      const rs = [...el.querySelectorAll(".w,.num,.sub")].map((e) => e.getBoundingClientRect()).filter((r) => r.width);
      if (!rs.length) return;
      const box = { l: Math.min(...rs.map((r) => r.left)), r: Math.max(...rs.map((r) => r.right)), t: Math.min(...rs.map((r) => r.top)), b: Math.max(...rs.map((r) => r.bottom)) };
      const miss = [];
      if (!LAND) {
        if (box.l < W * S.l - e || box.r > W * S.r + e) miss.push("the side crop");
        if (box.t < H * S.t - e) miss.push("the status bar");
        if (box.b > H * S.b + e) miss.push("the caption");
        if (box.b > H * S.railY && box.r > W * S.railX + e) miss.push("the button rail");
      }
      if ([...el.querySelectorAll(".line")].some((ln) => ln.scrollWidth > el.clientWidth + 2) && el.classList.contains("lower")) miss.push("its box (too wide)");
      if (miss.length) out.push(`${name} runs under ${miss.join(" and ")} — shorten it, add a <br>, or give it "size": 0.9`);
    };
    document.querySelectorAll("[data-title]").forEach((el) => check(el.dataset.title, el));
    return out;
  }, W, H, LAND);
  await b.close();
  found.forEach((m) => console.log(`  ⚠️  ${m}`));
  if (!found.length) console.log(`  safe zone: every word clear${LAND ? " (widescreen: no phone crop to check)" : ""}`);
}

// frames of this reel for the grid ("@t"): snapshotted from the composition itself, so they match it exactly
const stale = snapTimes.filter((s) => mtime(s.out) < mtime("reel.json"));
if (stale.length) {
  const dir = `${COMP}/.snaps`; fs.rmSync(dir, { recursive: true, force: true });
  hf(["snapshot", "--at", stale.map((s) => s.at).join(","), "--no-end", "--describe", "false", "-o", ".snaps"]);
  const pngs = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
  stale.forEach((s, k) => ff("-i", `${dir}/${pngs[k]}`, "-vf", `scale=${Math.round(W / 2)}:-2`, "-q:v", "3", s.out));
}

if (STORY) {  // hero frames: the middle of every segment and the moment each title has fully landed
  const at = new Set();
  SEGS.forEach((s) => { at.add(r3((s.t0 + s.t1) / 2)); s.titles.forEach((tt) => at.add(r3(Math.min(tt.t1 - 0.2, tt.t0 + 0.8)))); });
  const times = [...at].sort((a, b) => a - b), out = path.resolve("qa/storyboard");
  fs.rmSync(out, { recursive: true, force: true });
  hf(["snapshot", "--at", times.join(","), "--no-end", "--describe", "false", "-o", out]);
  // our own sheet: HyperFrames skips its contact sheet on a long list. Cell k (left to right) = times[k].
  ff("-pattern_type", "glob", "-i", `${out}/frame-*.png`, "-vf", `scale=${LAND ? 360 : 240}:-2,tile=9x${Math.ceil(times.length / 9)}:padding=4:color=white`, "-frames:v", "1", "-q:v", "3", "qa/storyboard.jpg");
  console.log(`storyboard: qa/storyboard.jpg (${times.length} frames, left to right at ${times.map((x) => x.toFixed(1)).join(", ")}s)\n  ← look at every frame before rendering; fix, then run again`);
}
if (NORENDER) process.exit(0);

hf(["render", "-o", path.resolve(OUT), "--fps", String(FPS), "--video-frame-format", "png", "--quiet"]);
// the cover: a still for the platform's thumbnail upload (LinkedIn lets you pick one; most chat apps don't)
ff("-ss", String(R.cover?.at ?? 2.0), "-i", OUT, "-frames:v", "1", "-q:v", "2", OUT.replace(".mp4", "-cover.jpg"));
console.log(`${END.toFixed(2)}s → ${OUT}  (+ cover, + cuts.json for qa.py)`);
