#!/usr/bin/env python3
"""Find a track's beat grid: how long one beat is, and when the first big hit lands.
Every cut in the reel sits on this grid, and the reel's opening runs until the first hit.

    python3 beats.py music/take1.mp3            print the grid, the candidate hits, and a loudness sketch
    python3 beats.py music/take1.mp3 --write    also save it into reel.json → "music"
    python3 beats.py music/take1.mp3 --hit 8.3  use a hit you picked by ear (with --write to save it)

Needs numpy (pip install numpy). It measures, it can't hear: the person listening decides which hit is "the" hit.
"""
import json, subprocess, sys
import numpy as np

if len(sys.argv) < 2 or sys.argv[1].startswith("-"):
    sys.exit(__doc__)
path = sys.argv[1]
SR, HOP, N = 22050, 512, 2048
FPS = SR / HOP
raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                     check=True, capture_output=True).stdout
x = np.frombuffer(raw, dtype=np.float32)
dur = len(x) / SR
fr = np.lib.stride_tricks.sliding_window_view(x, N)[::HOP] * np.hanning(N)
P = np.abs(np.fft.rfft(fr, axis=1))

# Onset strength: new energy arriving in each frame (spectral flux on a log scale, slow trend removed).
spec = np.log1p(P)
flux = np.concatenate([[0], np.maximum(np.diff(spec, axis=0), 0).sum(axis=1)])
flux = np.maximum(flux - np.convolve(flux, np.ones(16) / 16, mode="same"), 0)

# Beat length: the strongest repeat in the onset pattern, 60–170 BPM, gently preferring ~100 BPM so a
# half-time groove isn't read at double speed.
ac = np.correlate(flux, flux, mode="full")[len(flux) - 1:]
lo, hi = int(FPS * 60 / 170), int(FPS * 60 / 60)
bpm = 60 * FPS / np.arange(lo, hi)
score = ac[lo:hi] * np.exp(-0.5 * (np.log2(bpm / 100) / 0.5) ** 2)
lag = lo + int(np.argmax(score))
a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]
lag_f = lag + (0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) else 0)
beat = lag_f / FPS

# Where the beats fall (the grid's phase), from the onsets plus the bass.
bass = 10 * np.log10((P[:, 1:15] ** 2).sum(axis=1) + 1e-9)  # below ~150 Hz: kicks and drops
bflux = np.concatenate([[0], np.maximum(np.diff(bass), 0)])
best = (0.0, -1.0)
for ph in np.arange(0, beat, 1 / FPS):
    idx = ((ph + np.arange(0, dur - ph, beat)) * FPS).astype(int)
    idx = idx[idx < len(flux)]
    s = flux[idx].sum() + bflux[idx].sum()
    if s > best[1]:
        best = (ph, s)
phase = best[0]

# Candidate hits: the bass goes from quiet (a second below the midpoint) to loud (a second above it).
# Each lands on the grid; a riser often leads the real hit by one beat, so take the stronger bass onset of the two.
thr = (np.percentile(bass, 20) + np.percentile(bass, 90)) / 2
w = int(FPS)
def onset(t):
    k = int(t * FPS)
    return bflux[max(0, k - 2):k + 3].max()
cands, i = [], w
while i < len(bass) - w:
    if bass[i - w:i].mean() < thr and bass[i:i + w].mean() > thr:
        j = i - w + int(np.argmax(bass[i - w:i + w] > thr))
        g = phase + np.ceil((j / FPS - phase - 0.15) / beat) * beat
        g = max((g, g + beat), key=onset)
        k = int(g * FPS)
        lift = bass[k:k + 2 * w].mean() - bass[max(0, k - 2 * w):k].mean()
        cands.append((float(g), float(lift)))
        i += 2 * w
    else:
        i += 1
# Default: the first real lift after 3s, so the opening line has time to be read.
pick = next((g for g, lift in cands if g >= 3.0 and lift > -5), cands[0][0] if cands else 4 * beat)
if "--hit" in sys.argv:
    pick = float(sys.argv[sys.argv.index("--hit") + 1])

# Refine the beat LENGTH across 16 and 32 beats (the hit above is a point in time and stays put). One beat's lag
# is only as precise as one analysis frame (~23 ms), and that error adds up over a reel: the Lab reel's first
# grid (0.628s) drifted ~0.2s late by its close. The lag of 32 whole beats, divided by 32, measured 0.6317s,
# and loop joins then landed within a millisecond of the grid.
for nb in (16, 32):
    if (nb + 0.2) * beat < dur / 2:
        lo2, hi2 = int((nb - 0.2) * beat * FPS), int((nb + 0.2) * beat * FPS) + 1  # ±a fifth of a beat: never the neighbor
        beat = (lo2 + int(np.argmax(ac[lo2:hi2]))) / FPS / nb
print(f"beat       {beat:.4f}s  ({60 / beat:.1f} BPM)")
print(f"first hit  {pick:.2f}s   ← the opening runs until here")
print("candidates " + ", ".join(f"{g:.2f}s" for g, _ in cands[:8]))
print(f"length     {dur:.1f}s   (about {int((dur - pick) / beat)} beats after the hit)")
print("\nbass per second (each # is 4 dB):")
per = [bass[int(s * FPS):int((s + 1) * FPS)].mean() for s in range(int(dur))]
floor = min(per)
for s, v in enumerate(per):
    print(f"  {s:3d}s {'#' * max(0, int((v - floor) / 4))}{'  ← first hit' if s == int(pick) else ''}")

if "--write" in sys.argv:
    r = json.load(open("reel.json"))
    r.setdefault("music", {}).update({"file": path, "beat": round(beat, 4), "first_hit": round(pick, 3)})
    json.dump(r, open("reel.json", "w"), indent=2)
    print("\nsaved to reel.json → music")
