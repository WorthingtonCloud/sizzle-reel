#!/usr/bin/env python3
"""Check a cut (or a generated clip) before a human sees it. Writes images you should LOOK at, then prints
what it measured.

    python3 qa.py out/myreel-v3.mp4          a finished cut: preview frame, contact sheet, phone safe zone,
                                             every transition as a frame strip, blacks per segment, audio
    python3 qa.py clips/hero_480p.mp4 --clip a generated clip: frames every half second, to catch warped
                                             faces, melted objects, and garbled text before anyone pays for a final

Outputs land in qa/. Open every image it writes; a number can't tell you a frame looks wrong.
"""
import glob, json, os, re, subprocess, sys
from fractions import Fraction

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
fps = float(Fraction(v.get("r_frame_rate", "30/1")))
print(f"{src}: {W}x{H}, {dur:.2f}s, range={v.get('color_range', '?')}")

# Contact sheet. Every cell is normalized to one pixel format first: tiling frames of mixed formats fails.
step = 0.5 if CLIP else 1.0
cols = 5 if CLIP else 8
n = int(dur / step) + 1
rows = -(-n // cols)
cw = 216 if H > W else 320
ff("-i", src, "-vf", f"fps=1/{step},scale={cw}:-2,format=yuvj420p,tile={cols}x{rows}:padding=4:color=white",
   "-frames:v", "1", "-q:v", "3", f"qa/{base}-sheet.jpg")
print(f"  sheet   qa/{base}-sheet.jpg  ({n} frames, one every {step}s, left to right: cell k = {step}·k seconds) ← look at it")

if CLIP:
    print("  check:  warping or melting · text or logos (the model invents them) · a sudden cut or scene change ·"
          " camera shake · anything the prompt asked for that isn't there. Reject in the ledger with the reason.")
    sys.exit(0)

# Frame one is the preview in chat apps and most feeds. It should say the hook, not show an empty frame.
ff("-i", src, "-frames:v", "1", "-q:v", "2", f"qa/{base}-first-frame.jpg")
print(f"  preview qa/{base}-first-frame.jpg  ← this is what people see before they press play")

# Phone safe zone (vertical only): one frame a second, with LinkedIn's covered areas shaded red.
# Words in a red area get cropped or sit under a button on a phone. Numbers match titles.mjs's SAFE.
if H > W:
    def box(x0, y0, x1, y1):
        return f"drawbox=x={round(W * x0)}:y={round(H * y0)}:w={round(W * (x1 - x0))}:h={round(H * (y1 - y0))}:color=red@0.35:t=fill"
    zones = ",".join([box(0, 0, 1, 0.10), box(0, 0.84, 1, 1), box(0, 0, 0.11, 1), box(0.89, 0, 1, 1), box(0.80, 0.62, 1, 0.84)])
    ff("-i", src, "-vf", f"fps=1,{zones},scale=216:-2,format=yuvj420p,tile={cols}x{rows}:padding=4:color=white",
       "-frames:v", "1", "-q:v", "3", f"qa/{base}-safe.jpg")
    print(f"  safe    qa/{base}-safe.jpg  ← no words in the red: phones crop the sides, buttons cover the rest")

# The cut list build.mjs wrote next to the video: where every segment starts and how it arrives.
cuts_file = src.replace(".mp4", ".cuts.json")
cuts = json.load(open(cuts_file)) if os.path.exists(cuts_file) else []

# Every transition as a strip of ten frames (six before the switch, four after). Stuck layers, ghosted titles,
# empty frames and flashes of black show up here and nowhere else: a one-per-second sheet steps right over them.
if cuts:
    strips = []
    for i, c in enumerate(cuts[1:], 1):
        n = round(c["t0"] * fps)
        out = f"qa/_strip{i:02d}.jpg"
        ff("-i", src, "-vf", f"select='between(n\\,{n - 6}\\,{n + 3})',scale=216:-2,format=yuvj420p,tile=10x1:padding=4:color=white",
           "-frames:v", "1", "-fps_mode", "passthrough", out)
        strips.append(out)
    ins = sum((["-i", f] for f in strips), [])
    ff(*ins, "-filter_complex", f"vstack=inputs={len(strips)}", "-q:v", "3", f"qa/{base}-cuts.jpg")
    for f in strips:
        os.remove(f)
    print(f"  cuts    qa/{base}-cuts.jpg  (one row per transition, in order: {', '.join(c['name'] for c in cuts[1:])}) ← look at it")

# Blacks: one flat patch per segment, measured, never judged by eye. A drawn scene, a card and a page panel should
# all sit on the same ground; a segment that reads lighter looks like a mistake when it cuts against the rest.
if cuts:
    print("  blacks  (corner brightness 0–255 at each segment's middle) — the drawn and card segments should match:")
    ys = []
    for c in cuts:
        r = subprocess.run(["ffmpeg", "-hide_banner", "-ss", f"{(c['t0'] + c['t1']) / 2:.2f}", "-i", src, "-frames:v", "1",
                            "-vf", "crop=40:40:8:8,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"],
                           capture_output=True, text=True)
        m = re.search(r"YAVG=([\d.]+)", r.stderr)
        ys.append((c["name"], float(m.group(1)) if m else -1, c.get("kind") in ("clip", "still")))
    # full-frame footage has its own blacks; everything drawn on the ground should match the typical segment
    ground = sorted(y for _, y, footage in ys if not footage and 0 <= y < 40)
    typical = ground[len(ground) // 2] if ground else None
    for name, y, footage in ys:
        flag = "  (footage)" if footage else "  ⚠️ lighter or darker than the rest" if typical is not None and 0 <= y < 40 and abs(y - typical) > 4 else ""
        print(f"    {name:28s} {y:6.1f}{flag}")

# Black holes: a page on screen before (or after) its slot paints as a solid black rectangle unless its video plays
# early, and the 3D hand-offs put pages there (v19's first draft). Near every cut, measure how much of the middle of
# the frame is darker than the ground can be; the reel's ground is never pure black, so a big patch of it is a hole.
if cuts:
    lo = 2 if v.get("color_range") == "pc" else 18  # pure black, with a little room for grain
    holes = []
    for a, b in zip(cuts, cuts[1:]):
        if "clip" in (a.get("kind"), b.get("kind")):
            continue  # real footage has real blacks
        r = subprocess.run(["ffmpeg", "-hide_banner", "-ss", f"{max(0, b['t0'] - 0.6):.2f}", "-t", "1.2", "-i", src, "-vf",
                            f"crop=iw*0.8:ih*0.8,lutyuv=y='if(lte(val,{lo}),255,0)',signalstats,metadata=print:key=lavfi.signalstats.YAVG",
                            "-f", "null", "-"], capture_output=True, text=True)
        worst = max((float(x) for x in re.findall(r"YAVG=([\d.]+)", r.stderr)), default=0) / 255
        if worst > 0.06:
            holes.append((b["name"], worst))
    for name, f in holes:
        print(f"  ⚠️  black hole  {f:.0%} of the frame is pure black near the cut into {name} — a page or clip outside its slot? look at that row of the cuts strip")
    if not holes:
        print("  holes   none: no pure-black patches near any cut")

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
