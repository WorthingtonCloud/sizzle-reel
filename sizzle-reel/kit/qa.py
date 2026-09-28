#!/usr/bin/env python3
"""Check a cut (or a generated clip) before a human sees it. Writes images you should LOOK at, then prints
what it measured.

    python3 qa.py out/myreel-v3.mp4          a finished cut: preview frame, contact sheet, blacks, audio
    python3 qa.py clips/hero_480p.mp4 --clip a generated clip: frames every half second, to catch warped
                                             faces, melted objects, and garbled text before anyone pays for a final

Outputs land in qa/. Open every image it writes; a number can't tell you a frame looks wrong.
"""
import glob, json, os, re, subprocess, sys

if len(sys.argv) < 2:
    sys.exit(__doc__)
src = sys.argv[1]
CLIP = "--clip" in sys.argv
os.makedirs("qa", exist_ok=True)
base = os.path.splitext(os.path.basename(src))[0]


def ff(*a, **kw):
    return subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *a], check=True, **kw)


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


info = probe(src)
v = next(s for s in info["streams"] if s["codec_type"] == "video")
dur = float(info["format"]["duration"])
W, H = int(v["width"]), int(v["height"])
print(f"{src}: {W}x{H}, {dur:.2f}s, range={v.get('color_range', '?')}")

# Contact sheet. Every cell is normalized to one pixel format first: tiling frames of mixed formats fails.
step = 0.5 if CLIP else 1.0
cols = 5 if CLIP else 8
n = int(dur / step) + 1
rows = -(-n // cols)
cw = 216 if H > W else 320
ff("-i", src, "-vf", f"fps=1/{step},scale={cw}:-2,format=yuvj420p,tile={cols}x{rows}:padding=4:color=white",
   "-frames:v", "1", "-q:v", "3", f"qa/{base}-sheet.jpg")
print(f"  sheet   qa/{base}-sheet.jpg  ({n} frames, one every {step}s) ← look at it")

if CLIP:
    print("  check:  warping or melting · text or logos (the model invents them) · a sudden cut or scene change ·"
          " camera shake · anything the prompt asked for that isn't there. Reject in the ledger with the reason.")
    sys.exit(0)

# Frame one is the preview in chat apps and most feeds. It should say the hook, not show an empty frame.
ff("-i", src, "-frames:v", "1", "-q:v", "2", f"qa/{base}-first-frame.jpg")
print(f"  preview qa/{base}-first-frame.jpg  ← this is what people see before they press play")

# Blacks: measure a flat patch of every segment, never judge by eye.
segs = sorted(glob.glob("seg/*.mp4"))
segs = [s for s in segs if not os.path.basename(s).startswith(("picture", "audio"))]
if segs:
    print("  blacks  (corner brightness 0–255, range tag) — every segment should match:")
    rows_out = []
    for s in segs:
        d = float(probe(s)["format"]["duration"])
        r = subprocess.run(["ffmpeg", "-hide_banner", "-ss", f"{d / 2:.2f}", "-i", s, "-frames:v", "1",
                            "-vf", "crop=40:40:8:8,signalstats,metadata=print:key=lavfi.signalstats.YAVG",
                            "-f", "null", "-"], capture_output=True, text=True)
        m = re.search(r"YAVG=([\d.]+)", r.stderr)
        y = float(m.group(1)) if m else -1
        rng = next(x for x in probe(s)["streams"] if x["codec_type"] == "video").get("color_range", "?")
        rows_out.append((os.path.basename(s), y, rng))
    ranges = {r for _, _, r in rows_out}
    darks = [y for _, y, _ in rows_out if 0 <= y < 40]
    for name, y, rng in rows_out:
        flag = "  ⚠️" if (len(ranges) > 1 or (darks and 0 <= y < 40 and abs(y - min(darks)) > 4)) else ""
        print(f"    {name:28s} {y:6.1f}  {rng}{flag}")
    if len(ranges) > 1:
        print("  ⚠️  mixed range tags: joined, some blacks will turn gray. Every segment must end with build.py's NORMALIZE.")

# Audio: one continuous track. A dip or a gap reads as "the audio dropped out".
r = subprocess.run(["ffmpeg", "-hide_banner", "-i", src, "-vn", "-af", "ebur128=metadata=1,ametadata=print:key=lavfi.r128.M",
                    "-f", "null", "-"], capture_output=True, text=True)
vals = [(float(t), float(m)) for t, m in re.findall(r"pts_time:([\d.]+)\n.*?lavfi\.r128\.M=(-?[\d.]+|-inf)", r.stderr) if m != "-inf"]
if vals:
    body = [m for t, m in vals if 1.0 < t < dur - 3.0]
    med = sorted(body)[len(body) // 2] if body else 0
    gaps = [t for t, m in vals if 1.0 < t < dur - 3.0 and m < med - 15]
    if gaps:
        print(f"  ⚠️  audio drops more than 15 LU below its typical level at {gaps[0]:.1f}s"
              f"{f' … {gaps[-1]:.1f}s' if len(gaps) > 1 else ''} — a viewer hears that as a broken file")
    else:
        print(f"  audio   continuous (typical {med:.1f} LUFS), fades only at the end")
else:
    print("  ⚠️  no audio track")
