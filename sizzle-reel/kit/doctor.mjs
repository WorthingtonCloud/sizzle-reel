// Preflight: run this before anything else, so a missing tool fails here with a plain message instead of
// deep inside a build with a confusing one.   node doctor.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { findPuppeteer, findChrome } from "./lib/browser.mjs";

const rows = [];
const add = (need, name, ok, detail, fix) => rows.push({ need, name, ok, detail, fix });
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch { return null; } };

add("required", "node 22+", Number(process.versions.node.split(".")[0]) >= 22, process.versions.node, "install Node 22 or newer (HyperFrames needs it)");

const ffv = sh("ffmpeg", ["-hide_banner", "-version"]);
const filters = sh("ffmpeg", ["-hide_banner", "-filters"]) || "";
// A stripped ffmpeg reports a missing filter as a syntax error in your command. Check the ones the kit uses.
const needF = ["scale", "crop", "fps", "format", "overlay", "fade", "zoompan", "tpad", "tile", "drawbox", "signalstats",
  "metadata", "ebur128", "ametadata", "setparams", "afade", "atrim", "aformat"];
const encoders = sh("ffmpeg", ["-hide_banner", "-encoders"]) || "";
const missing = [...needF.filter((f) => !new RegExp(`\\s${f}\\s`).test(filters)),
  ...["libx264", "aac"].filter((e) => !new RegExp(`\\s${e}\\s`).test(encoders)).map((e) => `${e} encoder`)];
add("required", "ffmpeg (full build)", !!ffv && missing.length === 0, ffv ? (missing.length ? `missing filters: ${missing.join(", ")}` : ffv.split("\n")[0].slice(0, 40)) : "not found",
  "install a full ffmpeg (macOS: brew install ffmpeg · Linux: your package manager, or a static build)");
add("required", "ffprobe", !!sh("ffprobe", ["-version"]), "", "comes with ffmpeg");

const hfv = sh(process.platform === "win32" ? "npx.cmd" : "npx", ["--no-install", "hyperframes", "--version"]);
add("required", "hyperframes", !!hfv, (hfv || "not found").trim().split("\n").pop(), "in this folder: npm install   (renders the reel)");
add("required", "gsap", fs.existsSync("node_modules/gsap/dist/gsap.min.js"), "node_modules/gsap", "in this folder: npm install");
const pp = findPuppeteer();
add("required", "puppeteer", !!pp, pp ? `${pp.name}` : "not found", "in this folder: npm i puppeteer");
if (pp?.name === "puppeteer-core") add("required", "Chrome", !!findChrome(), findChrome() || "not found", "set CHROME=/path/to/chrome");

const PY = process.env.PYTHON || "python3";
const py = sh(PY, ["-c", "import sys; print(sys.version.split()[0])"]);
add("required", PY, !!py, (py || "").trim(), "install Python 3.9+ (Windows: run the kit under WSL)");
const np = sh(PY, ["-c", "import numpy; print(numpy.__version__)"]);
add("required", "numpy", !!np, (np || "").trim() || "not found", "pip install numpy   (or set PYTHON to an interpreter that has it)");

const reel = fs.existsSync("reel.json") ? JSON.parse(fs.readFileSync("reel.json", "utf8")) : {};
const fcss = reel.font?.css;
add("optional", "font", !!fcss && fs.existsSync(fcss), fcss && fs.existsSync(fcss) ? fcss : "none yet", 'node fonts.mjs "<Google Font name>", then set reel.json → font.css');
const env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
const has = (k) => !!process.env[k] || new RegExp(`^${k}=`, "m").test(env);
add("paid only", "KIE_AI_API_KEY", has("KIE_AI_API_KEY"), "music, stills, and hosting the input image for every clip", "only if you generate: kie.ai → API key → .env");
add("paid only", "HIGGSFIELD_API_KEY", has("HIGGSFIELD_API_KEY"), "Seedance clips (also needs the kie.ai key)", "only for Seedance clips: Higgsfield → API key → .env");

let bad = 0;
for (const r of rows) {
  const mark = r.ok ? "✓" : r.need === "required" ? "✗" : "·";
  if (!r.ok && r.need === "required") bad++;
  console.log(`${mark} ${r.name.padEnd(20)} ${r.need.padEnd(12)} ${r.ok ? r.detail : `${r.detail} → ${r.fix}`}`);
}
console.log(bad ? `\n${bad} required item(s) missing.` : "\nReady. A reel made only from code-drawn scenes, page recordings and your own media costs nothing.");
console.log("HyperFrames telemetry: build.mjs turns it off (HYPERFRAMES_NO_TELEMETRY=1). Run hyperframes by hand? Set it yourself.");
process.exit(bad ? 1 : 0);
