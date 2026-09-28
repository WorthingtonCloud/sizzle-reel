// Preflight: run this before anything else, so a missing tool fails here with a plain message instead of
// deep inside a build with a confusing one.   node doctor.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { findPuppeteer, findChrome } from "./lib/browser.mjs";

const rows = [];
const add = (need, name, ok, detail, fix) => rows.push({ need, name, ok, detail, fix });
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch { return null; } };

add("required", "node 18+", Number(process.versions.node.split(".")[0]) >= 18, process.versions.node, "install Node 18 or newer");

const ffv = sh("ffmpeg", ["-hide_banner", "-version"]);
const filters = sh("ffmpeg", ["-hide_banner", "-filters"]) || "";
// A stripped ffmpeg reports a missing filter as a syntax error in your command. Check the ones the kit uses.
const needF = ["scale", "overlay", "fade", "zoompan", "tpad", "tile", "signalstats", "ebur128", "setparams", "afade", "atrim"];
const missing = needF.filter((f) => !new RegExp(`\\s${f}\\s`).test(filters));
add("required", "ffmpeg (full build)", !!ffv && missing.length === 0, ffv ? (missing.length ? `missing filters: ${missing.join(", ")}` : ffv.split("\n")[0].slice(0, 40)) : "not found",
  "install a full ffmpeg (macOS: brew install ffmpeg · Linux: your package manager, or a static build)");
add("required", "ffprobe", !!sh("ffprobe", ["-version"]), "", "comes with ffmpeg");

const pp = findPuppeteer();
add("required", "puppeteer", !!pp, pp ? `${pp.name}` : "not found", "in this folder: npm i puppeteer");
if (pp?.name === "puppeteer-core") add("required", "Chrome", !!findChrome(), findChrome() || "not found", "set CHROME=/path/to/chrome");

const py = sh("python3", ["-c", "import sys; print(sys.version.split()[0])"]);
add("required", "python3", !!py, (py || "").trim(), "install Python 3.9+");
const np = sh(process.env.PYTHON || "python3", ["-c", "import numpy; print(numpy.__version__)"]);
add("for beats.py", "numpy", !!np, (np || "").trim() || "not found", "pip install numpy   (or set PYTHON to an interpreter that has it)");

add("optional", "font", fs.existsSync("fonts/font.css"), fs.existsSync("fonts/font.css") ? "fonts/font.css" : "none yet", 'node fonts.mjs "<Google Font name>"');
const env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
const has = (k) => !!process.env[k] || new RegExp(`^${k}=`, "m").test(env);
add("paid only", "KIE_AI_API_KEY", has("KIE_AI_API_KEY"), "music, stills, image hosting", "only if you generate: kie.ai → API key → .env");
add("paid only", "HIGGSFIELD_API_KEY", has("HIGGSFIELD_API_KEY"), "Seedance clips", "only for Seedance clips: Higgsfield → API key → .env");

let bad = 0;
for (const r of rows) {
  const mark = r.ok ? "✓" : r.need === "required" ? "✗" : "·";
  if (!r.ok && r.need === "required") bad++;
  console.log(`${mark} ${r.name.padEnd(20)} ${r.need.padEnd(12)} ${r.ok ? r.detail : `${r.detail} → ${r.fix}`}`);
}
console.log(bad ? `\n${bad} required item(s) missing.` : "\nReady. A reel made only from code-drawn scenes, page recordings and your own media costs nothing.");
process.exit(bad ? 1 : 0);
