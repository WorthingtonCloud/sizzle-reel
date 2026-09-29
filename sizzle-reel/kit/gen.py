#!/usr/bin/env python3
"""Paid generation: music, stills, and short video clips. Every call is gated and logged.

    python3 gen.py music --style "…" [--negative "…"] [--title "…"] [--duration 45]
    python3 gen.py still --prompt "…" --out stills/x.png [--ar 9:16] [--ref stills/y.png]
    python3 gen.py clip  --image stills/x.png --prompt "…" --out clips/x_480p.mp4 [--res 480p|720p] [--dur 5] [--via higgsfield|kie]
    python3 gen.py spent                                   total spend so far, from ledger.csv

Without --yes it only prints the estimated cost and exits: that is the moment to ask the human.
With --yes it spends, then appends a row to ledger.csv (kept = "pending" until someone decides).
It refuses to run past reel.json → "budget_usd" unless you add --over.

Keys, from the environment or a .env file in this folder or any folder above it:
    KIE_AI_API_KEY       kie.ai  — music (Suno), stills (Seedream), clips (Kling), and hosting for input images
    HIGGSFIELD_API_KEY   Higgsfield — clips (Seedance 2.5), as "<key_id>:<key_secret>"
Costs below are estimates from each vendor's published pricing. Check the vendor's billing page for the truth.
"""
import argparse, base64, csv, datetime, json, os, sys, time, urllib.request

KIE, KIE_UP = "https://api.kie.ai", "https://kieai.redpandaai.co/api/file-base64-upload"
HF, HF_STATUS = "https://api.higgsfield.ai/bytedance/seedance-2.5/image-to-video", "https://platform.higgsfield.ai/requests/{}/status"
UA = "curl/8.7.1"  # Higgsfield's firewall rejects Python's default user agent (error 1010) before any job exists


def key(name):
    if os.environ.get(name):
        return os.environ[name]
    d = os.getcwd()
    for _ in range(8):
        p = os.path.join(d, ".env")
        if os.path.exists(p):
            for line in open(p):
                if line.strip().startswith(name + "="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
        d = os.path.dirname(d)
    sys.exit(f"{name} not set (environment or .env)")


def call(url, body=None, headers=None, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", "User-Agent": UA, **(headers or {})})
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def fetch(url, out):
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    open(out, "wb").write(urllib.request.urlopen(req, timeout=300).read())


def host(path):
    """Video models need a public image URL; kie.ai's upload endpoint provides one."""
    print(f"  uploading {path} to kie.ai's file host so the model can read it (it leaves this machine)", flush=True)
    ext = os.path.splitext(path)[1].lstrip(".").lower().replace("jpg", "jpeg")
    r = call(KIE_UP, {"base64Data": f"data:image/{ext};base64," + base64.b64encode(open(path, "rb").read()).decode(),
                      "uploadPath": "reel", "fileName": os.path.basename(path)}, {"Authorization": f"Bearer {key('KIE_AI_API_KEY')}"})
    d = r.get("data") or {}
    url = d.get("downloadUrl") or d.get("fileUrl") or d.get("url")
    if not url:
        sys.exit(f"upload failed: {json.dumps(r)[:300]}")
    return url


def poll(label, fn, timeout=1200):
    """Print on every poll, so a quiet log means something. A failed poll is 'unknown', never 'done'."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        time.sleep(8)
        try:
            state, result = fn()
        except Exception as e:
            print(f"  {label}: poll failed ({e}) — status unknown, still waiting", flush=True)
            continue
        print(f"  {label}: {state} ({int(time.time() - t0)}s)", flush=True)
        if result is not None:
            return result
        if state in ("fail", "failed", "nsfw", "canceled", "cancelled"):
            sys.exit(f"{label}: {state}")
    sys.exit(f"{label}: gave up after {timeout}s. The job may still finish; check the vendor dashboard before re-running.")


def kie_task(model, inp):
    r = call(f"{KIE}/api/v1/jobs/createTask", {"model": model, "input": inp}, {"Authorization": f"Bearer {key('KIE_AI_API_KEY')}"})
    tid = (r.get("data") or {}).get("taskId")
    if not tid:
        sys.exit(f"createTask {model}: {json.dumps(r)[:300]}")
    return tid


def kie_wait(tid, label):
    def fn():
        d = call(f"{KIE}/api/v1/jobs/recordInfo?taskId={tid}", headers={"Authorization": f"Bearer {key('KIE_AI_API_KEY')}"}).get("data") or {}
        st = d.get("state") or d.get("status") or "queued"
        if st == "success":
            out = d.get("resultJson")
            return st, json.loads(out) if isinstance(out, str) else out
        return st, None
    return poll(label, fn)


LEDGER = "ledger.csv"
COLS = ["date", "shot", "tool", "model", "resolution", "seconds", "cost_usd", "kept", "why"]


def spent():
    if not os.path.exists(LEDGER):
        return 0.0
    return sum(float(r["cost_usd"] or 0) for r in csv.DictReader(open(LEDGER)))


def log(**row):
    """Written the moment a job is submitted: the vendor bills on submit, so a crash or a timeout while
    waiting must still count toward the budget. Returns the row's index for amend()."""
    new = not os.path.exists(LEDGER)
    with open(LEDGER, "a", newline="") as f:
        w = csv.DictWriter(f, COLS)
        if new:
            w.writeheader()
        w.writerow({"date": datetime.date.today().isoformat(), "kept": "pending", **row})
    return sum(1 for _ in csv.DictReader(open(LEDGER))) - 1


def amend(i, **fields):
    rows = list(csv.DictReader(open(LEDGER)))
    rows[i].update(fields)
    with open(LEDGER, "w", newline="") as f:
        w = csv.DictWriter(f, COLS)
        w.writeheader()
        w.writerows(rows)


def gate(est, what, a):
    budget = json.load(open("reel.json")).get("budget_usd") if os.path.exists("reel.json") else None
    so_far = spent()
    print(f"{what}: about ${est:.2f}. Spent so far: ${so_far:.2f}" + (f" of a ${budget:.2f} budget." if budget is not None else "."))
    if budget is not None and so_far + est > budget and not a.over:
        sys.exit("⛔ that would pass the budget. Ask the human; re-run with --over only if they say so.")
    if not a.yes:
        sys.exit("Not spent. Re-run with --yes once the human has approved this cost.")


ap = argparse.ArgumentParser()
ap.add_argument("cmd", choices=["music", "still", "clip", "spent"])
ap.add_argument("--style"); ap.add_argument("--negative", default="vocals, singing, lyrics, horror, ominous, eerie")
ap.add_argument("--title", default="reel bed"); ap.add_argument("--duration", type=int, default=45)
ap.add_argument("--prompt"); ap.add_argument("--out"); ap.add_argument("--ar", default="9:16"); ap.add_argument("--ref")
ap.add_argument("--image"); ap.add_argument("--res", default="480p"); ap.add_argument("--dur", type=int, default=5)
ap.add_argument("--via", default="higgsfield", choices=["higgsfield", "kie"])
ap.add_argument("--yes", action="store_true"); ap.add_argument("--over", action="store_true")
a = ap.parse_args()

if a.cmd == "spent":
    print(f"${spent():.2f} spent, per {LEDGER}")

elif a.cmd == "music":
    if not a.style:
        sys.exit("--style is required: genre, tempo, energy, instruments, and what it should build to")
    gate(0.06, "Two ~45s instrumental takes (Suno V6 on kie.ai, 12 credits)", a)
    # the model name is NESTED: outer "ai-music-api/generate", inner "V6". A top-level "V6" returns 422.
    tid = kie_task("ai-music-api/generate", {"custom_mode": True, "instrumental": True, "title": a.title, "style": a.style,
                                             "negative_tags": a.negative, "duration": a.duration, "model": "V6"})
    row = log(shot="music (submitted)", tool="kie.ai", model="suno V6", resolution="n/a", seconds=a.duration, cost_usd=0.06,
              why=f"task {tid} · {a.style[:120]}")
    res = kie_wait(tid, "music")
    os.makedirs("music", exist_ok=True)
    have = len([f for f in os.listdir("music") if f.startswith("take") and f.endswith(".mp3")])
    for i, t in enumerate(res.get("data", []), have + 1):
        fetch(t["audio_url"], f"music/take{i}.mp3")
        print(f"music/take{i}.mp3")
    # Keep each take's audio id: extending a take later (Suno "extend") needs it, and kie.ai forgets it after 14 days.
    ids = " ".join(f"take{i}={t.get('id', '?')}" for i, t in enumerate(res.get("data", []), have + 1))
    amend(row, shot=f"music takes {have + 1}-{have + len(res.get('data', []))}", why=f"{ids} · {a.style[:120]}")

elif a.cmd == "still":
    if not (a.prompt and a.out):
        sys.exit("--prompt and --out are required")
    gate(0.14, f"One still ({a.ar}, Seedream 5 Pro on kie.ai)", a)
    inp = {"prompt": a.prompt, "aspect_ratio": a.ar, "quality": "high", "output_format": "png", "nsfw_checker": False}
    model = "seedream/5-pro-text-to-image"
    if a.ref:
        model, inp["image_urls"] = "seedream/5-pro-image-to-image", [host(a.ref)]
    tid = kie_task(model, inp)
    log(shot=os.path.basename(a.out), tool="kie.ai", model=model, resolution=a.ar, seconds=0, cost_usd=0.14, why=f"task {tid} · {a.prompt[:120]}")
    res = kie_wait(tid, os.path.basename(a.out))
    urls = res.get("resultUrls") or res.get("result_urls") or []
    fetch(urls[0], a.out)
    print(a.out)

elif a.cmd == "clip":
    if not (a.image and a.prompt and a.out):
        sys.exit("--image, --prompt and --out are required")
    if a.via == "higgsfield":
        h = {"480p": 480, "720p": 720}[a.res]
        # Higgsfield bills tokens = h × w × seconds × 24 / 1024 at $0.0214 per 1,000 (5s: ~$1.03 at 480p, ~$2.31 at 720p)
        est = h * round(h * 16 / 9) * a.dur * 24 / 1024 / 1000 * 0.0214
        gate(est, f"One {a.dur}s {a.res} clip (Seedance 2.5 on Higgsfield; the shape follows the input image)", a)
        body = {"image_url": host(a.image), "prompt": a.prompt, "duration": a.dur, "resolution": a.res, "generate_audio": False}
        r = call(HF, body, {"Authorization": f"Key {key('HIGGSFIELD_API_KEY')}"})
        rid = r.get("request_id") or r.get("id")
        print(f"submitted {rid}", flush=True)
        log(shot=os.path.basename(a.out), tool=a.via, model="seedance-2.5 image-to-video", resolution=a.res, seconds=a.dur,
            cost_usd=round(est, 2), why=f"request {rid} · {a.prompt[:120]}")

        def fn():
            s = call(HF_STATUS.format(rid), headers={"Authorization": f"Key {key('HIGGSFIELD_API_KEY')}"})
            st = s.get("status")
            return st, (s.get("video") or {}).get("url") if st == "completed" else None
        fetch(poll(os.path.basename(a.out), fn), a.out)
    else:
        est = 0.80
        gate(est, f"One {a.dur}s clip (Kling 2.1 Pro on kie.ai)", a)
        tid = kie_task("kling/v2-1-pro", {"prompt": a.prompt, "image_url": host(a.image), "duration": str(a.dur),
                       "negative_prompt": "blur, distortion, warping, morphing, text, watermark, cut, scene change", "cfg_scale": 0.5})
        log(shot=os.path.basename(a.out), tool=a.via, model="kling v2.1 pro", resolution=a.res, seconds=a.dur, cost_usd=est,
            why=f"task {tid} · {a.prompt[:120]}")
        res = kie_wait(tid, os.path.basename(a.out))
        fetch((res.get("resultUrls") or [])[0], a.out)
    print(a.out, "— now run: python3 qa.py", a.out, "--clip")
