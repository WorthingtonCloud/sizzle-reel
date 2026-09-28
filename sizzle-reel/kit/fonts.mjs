// Download a Google Font to ./fonts and write fonts/font.css pointing at the local files.
// Usage: node fonts.mjs "Archivo" 500,600,700,800
// Why local: titles and scenes render from file:// pages, and a remote @import there can hang the load forever.
import fs from "node:fs";
import path from "node:path";

const [family = "Archivo", weights = "500,600,700,800"] = process.argv.slice(2);
const q = `${family.replace(/ /g, "+")}:wght@${weights.split(",").join(";")}`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const res = await fetch(`https://fonts.googleapis.com/css2?family=${q}&display=block`, { headers: { "User-Agent": UA } });
if (!res.ok) { console.error(`Google Fonts said ${res.status} for "${family}". Check the spelling on fonts.google.com.`); process.exit(1); }
let css = await res.text();
fs.mkdirSync("fonts", { recursive: true });
const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
let i = 0;
for (const u of urls) {
  const file = path.resolve("fonts", `${family.replace(/\W+/g, "")}-${i++}.woff2`);
  fs.writeFileSync(file, Buffer.from(await (await fetch(u)).arrayBuffer()));
  css = css.replaceAll(u, "file://" + file);
}
fs.writeFileSync("fonts/font.css", css);
console.log(`fonts/font.css: ${family} (${weights}), ${urls.length} files`);
