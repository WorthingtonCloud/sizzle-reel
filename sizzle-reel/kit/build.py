#!/usr/bin/env python3
"""Assemble the reel from reel.json: every segment on the music's beat grid, titles laid over, one continuous
track under it all, plus a cover image. Re-run end to end any time; nothing here spends money.

    python3 build.py                 build everything (renders missing titles, scenes and recordings first)
    python3 build.py --only s03,s05  rebuild just those segments, reuse the rest
    python3 build.py --audio-only    re-mux the music under the existing picture

Segment shape (reel.json → "segments"):
    {"name": "s02_hub", "beats": 12, "source": {"scene": "hub"}, "titles": [["t_layers", 0, 6], ["t_plugged", 6, "end"]]}
Length: "beats": n (on the grid) · "secs": x · "to_hit": true (runs until the music's first big hit).
Title times use the same unit as the segment's length ("end" = the segment's end).
Sources:
    {"scene": "chat"}                          a code-drawn scene from motion.html
    {"shot": "home"}                           a scroll recording of a real page (reel.json → "shots")
    {"clip": "clips/x.mp4", "ss": 0, "speed": 1}   a video clip (generated or your own footage)
    {"still": "stills/x.jpg", "push": 0.06}    a free slow push-in on a still image
    {"card": "t_title"}                        a full-frame title card (a "card" kind title)
    {"grid": ["rec/chat/f0040.jpg", …]}        tiles popping onto a board, a third of a beat apart
"""
import json, os, subprocess, sys, glob

R = json.load(open("reel.json"))
W, H = R["size"]
FPS = R.get("fps", 30)
PAL = R["palette"]
GROUND = PAL["ground"].lstrip("#")
M = R["music"]
B, HIT = float(M["beat"]), float(M["first_hit"])
OUT = f"out/{R['name']}-v{R.get('version', 1)}.mp4"
SEG = "seg"
os.makedirs(SEG, exist_ok=True)
os.makedirs("out", exist_ok=True)
ARGS = sys.argv[1:]
ONLY = set(ARGS[ARGS.index("--only") + 1].split(",")) if "--only" in ARGS else None
AUDIO_ONLY = "--audio-only" in ARGS
CFG_T = os.path.getmtime("reel.json")


def run(cmd, **kw):
    subprocess.run(cmd, check=True, **kw)


def fit():
    return f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},setsar=1"


# One brightness scale for every segment. Frames from JPEGs encode "full range" and cards/clips "limited range";
# joined with a stream copy, the player reads every segment with the first one's tag and the black of the
# others lifts to gray (measured: 11 → 26). Every chain ends here, so the whole reel is one scale.
NORMALIZE = ("scale=out_range=tv:out_color_matrix=bt709:flags=lanczos,format=yuv420p,"
             "setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709")


def seg_len(seg, t):
    if seg.get("to_hit"):
        return HIT - t, 1.0
    if "secs" in seg:
        return float(seg["secs"]), 1.0
    return float(seg["beats"]) * B, B


def ensure_titles():
    ids = {tt[0] for s in R["segments"] for tt in s.get("titles", [])}
    ids |= {s["source"]["card"] for s in R["segments"] if "card" in s["source"]}
    ids.add("scrim")
    stale = [i for i in ids if not os.path.exists(f"titles/{i}.png") or os.path.getmtime(f"titles/{i}.png") < CFG_T]
    if stale:
        run(["node", "titles.mjs"])


def frames(d):
    return sorted(glob.glob(f"{d}/f*.jpg"))


def ensure_source(src, dur):
    if "scene" in src:
        d, need = f"rec/{src['scene']}", round(dur * FPS)
        fs = frames(d)
        if len(fs) != need or os.path.getmtime(fs[0]) < max(CFG_T, os.path.getmtime("motion.html")):
            run(["node", "render_motion.mjs", src["scene"], f"{dur:.3f}"])
    elif "shot" in src:
        if not frames(f"rec/{src['shot']}"):
            run(["node", "record.mjs", src["shot"]])


def build_segment(i, seg, dur, unit):
    name, src = seg["name"], seg["source"]
    out = f"{SEG}/{name}.mp4"
    if ONLY is not None and name not in ONLY and os.path.exists(out):
        return out
    ensure_source(src, dur)
    ins, pre = [], ""
    if "scene" in src or "shot" in src:
        d = f"rec/{src.get('scene') or src['shot']}"
        n = len(frames(d))
        # stretch or squeeze the recorded frames to fill the slot exactly
        ins = ["-framerate", f"{n / dur:.5f}", "-start_number", "0", "-i", f"{d}/f%04d.jpg"]
        pre = f"[0:v]fps={FPS},{fit()}[base]"
    elif "clip" in src:
        ins = ["-ss", str(src.get("ss", 0)), "-i", src["clip"]]
        pre = (f"[0:v]setpts=(PTS-STARTPTS)/{src.get('speed', 1)},fps={FPS},{fit()},"
               f"tpad=stop_mode=clone:stop_duration=30[base]")
    elif "still" in src:
        n, push = round(dur * FPS), src.get("push", 0.06)
        ins = ["-loop", "1", "-framerate", str(FPS), "-i", src["still"]]
        # upscale first, then zoom: zoompan on a small image jitters
        pre = (f"[0:v]scale={W * 2}:{H * 2}:force_original_aspect_ratio=increase,crop={W * 2}:{H * 2},"
               f"zoompan=z='1+{push}*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={FPS},setsar=1[base]")
    elif "card" in src:
        ins = ["-loop", "1", "-framerate", str(FPS), "-i", f"titles/{src['card']}.png"]
        pre = f"color=c=0x{GROUND}:s={W}x{H}:r={FPS}[bg];[0:v]format=rgba[c];[bg][c]overlay=0:0:shortest=1[base]"
    elif "grid" in src:
        tiles = src["grid"]
        if len(tiles) % 3:
            print(f"  ⚠️  {name}: {len(tiles)} tiles leaves a gap in a 3-wide grid — an unfilled grid reads as a mistake")
        rows = -(-len(tiles) // 3)
        gap = round(min(W, H) * 0.028)
        tw = (W - 4 * gap) // 3 if W < H else round(W * 0.29)
        th = round(tw * H / W)
        while rows * th + (rows + 1) * gap > H:
            tw, th = round(tw * 0.95), round(th * 0.95)
        x0, y0 = (W - 3 * tw - 2 * gap) // 2, (H - rows * th - (rows - 1) * gap) // 2
        ins = ["-f", "lavfi", "-i", f"color=c=0x{GROUND}:s={W}x{H}:r={FPS}:d={dur}"]
        for p in tiles:
            ins += ["-i", p] if p.endswith(".mp4") else ["-loop", "1", "-framerate", str(FPS), "-i", p]
        chain, last = [], "0:v"
        for k in range(len(tiles)):
            chain.append(f"[{k + 1}:v]scale={tw}:{th}:force_original_aspect_ratio=increase,crop={tw}:{th},setsar=1,format=yuv420p[g{k}]")
        for k in range(len(tiles)):
            x, y = x0 + (k % 3) * (tw + gap), y0 + (k // 3) * (th + gap)
            # a third of a beat apart, so every tile has landed and holds well before the segment ends
            chain.append(f"[{last}][g{k}]overlay={x}:{y}:enable='gte(t,{k * B / 3:.3f})'[o{k}]")
            last = f"o{k}"
        pre = ";".join(chain) + f";[{last}]null[base]"
    else:
        sys.exit(f"{name}: unknown source {src}")

    titles = [(tid, float(a) * unit, dur if b == "end" else float(b) * unit) for tid, a, b in seg.get("titles", [])]
    if titles and seg.get("scrim", "shot" in src):  # footage with its own text needs a dark band behind ours
        titles = [("scrim", titles[0][1], titles[-1][2])] + titles
    n_in = ins.count("-i")
    fc, last = [pre], "base"
    for k, (tid, t0, t1) in enumerate(titles):
        ins += ["-loop", "1", "-framerate", str(FPS), "-i", f"titles/{tid}.png"]
        # the reel's very first title is on screen from frame one: chat apps and feeds use frame one as the preview
        fade_in = "" if (i == 0 and t0 == 0) else f"fade=in:st={t0:.3f}:d=0.12:alpha=1,"
        fc.append(f"[{n_in + k}:v]format=rgba,{fade_in}fade=out:st={max(t1 - 0.12, t0):.3f}:d=0.12:alpha=1[tt{k}]")
        fc.append(f"[{last}][tt{k}]overlay=0:0:enable='between(t,{t0:.3f},{t1:.3f})'[v{k}]")
        last = f"v{k}"
    fc.append(f"[{last}]{NORMALIZE}[out]")
    run(["ffmpeg", "-loglevel", "error", "-y", *ins, "-filter_complex", ";".join(fc), "-map", "[out]",
         "-t", f"{dur:.3f}", "-r", str(FPS), "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-an", out])
    return out


if not AUDIO_ONLY:
    ensure_titles()
outs, t, rows = [], 0.0, []
for i, seg in enumerate(R["segments"]):
    dur, unit = seg_len(seg, t)
    if dur <= 0:
        sys.exit(f"{seg['name']}: length {dur:.2f}s — a to_hit segment must come before the first hit")
    outs.append(f"{SEG}/{seg['name']}.mp4" if AUDIO_ONLY else build_segment(i, seg, dur, unit))
    rows.append(f"{t:6.2f}–{t + dur:6.2f}  {seg['name']}")
    t += dur
total = t
print("\n".join(rows))

with open(f"{SEG}/list.txt", "w") as f:
    f.writelines(f"file '{os.path.basename(o)}'\n" for o in outs)
if not AUDIO_ONLY:
    run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", f"{SEG}/list.txt", "-c", "copy", f"{SEG}/picture.mp4"])

# One track, straight through, full volume, fade at the very end. Silence, a restart, or a volume dip for a
# "dramatic pause" all read to a viewer as a broken file. Make drama with the picture, never the music.
fade = float(M.get("fade", 2.2))
offset = float(M.get("offset", 0))
fc = (f"[0:a]atrim={offset}:{offset + total:.3f},asetpts=PTS-STARTPTS,"
      f"afade=t=out:st={total - fade:.3f}:d={fade},aformat=sample_rates=44100:channel_layouts=stereo[a]")
run(["ffmpeg", "-loglevel", "error", "-y", "-i", M["file"], "-filter_complex", fc, "-map", "[a]", "-c:a", "pcm_s16le", f"{SEG}/audio.wav"])
run(["ffmpeg", "-loglevel", "error", "-y", "-i", f"{SEG}/picture.mp4", "-i", f"{SEG}/audio.wav", "-map", "0:v", "-map", "1:a",
     "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", OUT])

# The cover: a still for the platform's thumbnail upload (LinkedIn lets you pick one; most chat apps don't).
cov = R.get("cover", {"at": 2.0})
run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(cov.get("at", 2.0)), "-i", OUT, "-frames:v", "1", "-q:v", "2",
     OUT.replace(".mp4", "-cover.jpg")])
print(f"total {total:.2f}s → {OUT}  (+ cover)")
