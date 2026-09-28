---
name: sizzle-reel
description: >
  Make a short promo / sizzle reel end to end, the way an agent should: interview the human first, pitch
  the story, make the music, draw the scenes in code, record real web pages, prompt a few paid mood shots
  only where nothing else will do, cut everything on the music's beat, check its own work, and hand back a
  finished vertical or widescreen video plus a cover image. Use for "make a sizzle reel", "make a promo
  video", "a reel for my product / site / project", "a trailer for X", "a LinkedIn video", "a launch video",
  or to revise, re-cut, or reshape an existing reel. Most of a reel costs nothing; paid generation is gated
  on the human's yes and logged.
---

# sizzle-reel

A 30–60 second reel your agent makes by itself. You bring the idea, your taste, and your notes. The agent
writes it, scores it, draws it, records it, cuts it, and checks it. You never touch a timeline.

**What makes it look expensive instead of generated:** real material (your actual pages, your actual
numbers), text drawn sharp in code, one continuous track with every cut on the beat, and a handful of
cinematic shots used only where nothing real exists. **What makes it land:** a story that tells a
stranger why the thing exists and what they get from it, tested on someone who has never seen it.

## Setup, once per reel

```bash
mkdir -p reels/<name> && cp -R <this skill>/kit/ reels/<name>/ && cd reels/<name>
npm install                      # puppeteer, for titles, scenes and page recordings
pip install numpy                # for beats.py
node doctor.mjs                  # says plainly what's missing
node fonts.mjs "Archivo"         # or the brand's Google Font
```

Everything runs from the reel folder and reads one file, `reel.json`: size, palette, font, music grid,
titles, scenes, page recordings, and the segment list. Edit that file; don't edit the scripts per reel.
Keys go in `.env` in the reel folder, only if you generate anything paid (`KIE_AI_API_KEY`,
`HIGGSFIELD_API_KEY`). A reel from drawn scenes, recordings and the human's own media needs no key at all.

## Step 0: the interview — before anything is made

Ask **one question at a time**, each with **your recommended answer** so the human can just confirm or
correct. After **every** answer, write it to `brainstorm-<date>.md` (their words where the wording matters)
**before** asking the next one: the file, not your context, is the record. If a file or a page can answer a
question, read it instead of asking. Keep it to about eight questions:

1. **What is the reel for, who watches it, and where will it post?** This sets the shape: vertical 9:16 for
   phones and feeds, widescreen 16:9 for a website or a talk, 30–60 seconds either way. The words set the length, not the other way around.
2. **What should a stranger *get* by the end?** Not "be impressed": what the thing is, why it exists, what's
   in it for them. The most common failure is a reel that shows off, then shows a website, and leaves the
   viewer asking "what's this for?"
3. **The one line they should remember.** It becomes the closing line, and it is spent exactly once.
4. **What real material exists?** Pages to record (URLs), screenshots, charts, footage, the logo, brand
   colors and font. Real material is the proof and costs nothing.
5. **The music.** Offer three directions with your pick (for example: hip-hop drums under electronic synths;
   bright major-key electronic; cinematic percussion). Instrumental only when words are on screen.
6. **Does the human appear?** Face, voice, name, or none.
7. **Budget, and is paid generation OK at all?** A fully free reel is a real option. A typical paid reel is
   $10–15: two or three short cinematic shots plus music.
8. **Who is the cold viewer?** Someone who has never seen the thing, who will watch the finished cut while
   the human watches their face. And: anything that must never appear on screen.

Close with "anything we haven't touched?", then write the brief at the top of the file: purpose, audience,
the take-away, the closing line, the material list, music direction, budget, the off-limits list.

If the human truly can't be reached, answer the eight yourself from what you can read, mark the file
**Self-authored, not interviewed**, and say so in your report. That's a fallback, never the plan.

## Step 1: pitch two or three stories, then wait

Each pitch is a beat sheet: the on-screen words in order, what's on screen under each (drawn scene / page
recording / paid shot / title card), and what it costs. Recommend one. **Wait for the pick.** Write the
chosen one to `SCRIPT.md`. A story that connects: the problem a stranger recognizes → what this is → what
they get → proof (real pages, real numbers) → the closing line → the name.

## Step 2: the ~$2 test (only if anything is paid)

One music call (two takes, about $0.06) and, if the script has paid shots, one cheap 480p draft (about
$1). The human judges the sound and the look before the real spend. You can measure loudness; you can't
hear taste. Say so, and let their ears pick. Offer a second pair of takes in a different direction if the
first misses (the first direction usually does).

```bash
python3 gen.py music --style "hard-hitting hip-hop electronic hybrid, 95 BPM half-time groove, punchy kick and snare, big bass, builds into heavy drops, confident, not dark"   # prints the cost and stops
python3 gen.py music --style "…" --yes      # spends, after the human says yes
```

## Step 3: the beat grid

```bash
python3 beats.py music/take2.mp3 --write    # beat length + the first big hit → reel.json
```

The opening runs until the first hit; every later segment is a whole number of beats. If the human hears
the drop somewhere else, `--hit <seconds> --write`. The beat length is refined across 32 beats: measured from one
beat, a grid that is off by 4 ms lands the last cuts of a minute-long reel about a fifth of a second late.

**If the cut outgrows the song**, don't loop it blindly or fade early. Replay whole bars where the drums and tone
match on both sides of the join, placed *before* the build, so the song still has one build, one drop and one
final hit, and pin the twist to the drop and the end card to the final hit. Or extend the kept take with Suno's
extend call (about 6 cents; it needs the take's audio id, which `gen.py` writes to the ledger).

## Step 4: build everything free first

- **Drawn scenes** (`motion.html`): `chat` (a session that keeps forgetting), `hub` (the thing in the
  middle, its layers as rings, then everything it connects to), `sources` (a claim wiring down to the
  evidence behind it), `endcard` (logo in a tile, above the name, then the address). Change their words in
  `reel.json → scenes`; write a new scene when the story needs a picture of something real that has no
  footage — an animated diagram of the real thing beats any metaphor.
- **Page recordings** (`record.mjs`): smooth scrolls of real pages, at phone size for vertical.
- **Titles and cards** (`titles.mjs`, run by the build): `<br>` breaks a line, `<span class=a>` paints
  the accent color.
- **Free push-ins** on any still: `{"still": "stills/x.jpg", "push": 0.06}`.

## Step 5: paid shots, only where nothing real exists

Textless mood moments only: a lamp flickering on, a slow push through a room. Never a shot that needs
readable text, a logo, a UI or a diagram: models garble all four.

```bash
python3 gen.py still --prompt "…" --out stills/hero.png --ar 9:16            # the first frame
python3 gen.py clip --image stills/hero.png --prompt "…" --out clips/hero_480p.mp4 --res 480p --yes
python3 qa.py clips/hero_480p.mp4 --clip                                     # LOOK at the sheet
python3 gen.py clip … --res 720p --yes                                       # final, approved draft only
```

Draft at 480p, check, finalize at 720p (on a phone 720p and 1080p look the same, at less than half the
cost), check again: a re-roll is a new take. Every generation lands in `ledger.csv`; mark each kept or
rejected with the reason. `gen.py` refuses to run past `budget_usd` without `--over`, and never spends
without `--yes`. Get the human's yes, with the number, before every `--yes`.

## Step 6: cut, check, send

```bash
python3 build.py                     # renders anything missing, builds out/<name>-v<N>.mp4 + cover
python3 qa.py out/<name>-v1.mp4      # contact sheet, first frame, blacks per segment, audio continuity
```

Open the sheet and the first frame yourself. Then send the human the file, one line per change, the spend
so far, and one reminder: **show it to the cold viewer and ask "what's this for?"** Their answer is the
test. Bump `version` for every cut the human reviews; never overwrite one they've seen. Most notes are
free (words, timing, drawn scenes). Say the cost of any note that isn't, before doing it.

## House rules — each one is a round of notes someone already paid for

| Never | Instead |
|---|---|
| Text, labels, logos or UI from a video model | Draw them in code; paid shots are textless mood only |
| A metaphor shot for an idea a stranger has to decode | Show the real thing: an animated diagram, the real page |
| Silence, a restart, or a volume dip for a "dramatic pause" | One track, straight through, full volume, fade at the end. Drama comes from the picture |
| A first frame that's an empty screen | The hook title on screen from frame one: it's the preview in chat apps and feeds. Upload the cover image where the platform allows |
| Showing the closing line early (e.g. a page whose headline *is* the closing line) | Spend it once, at the close |
| A line that dates itself ("155 days") or says nothing ("The models.") | Cut it. Let the picture carry it |
| A title on screen for under two seconds, or a number written as a sentence | About two seconds for a short title, more for a long one; a number as one big figure. Two viewers called a 44-second cut with sub-second titles "too fast to follow"; the fix ran 58 seconds |
| A grid with a hole in it | Fill every tile, and let the last one land with time to hold |
| Blacks that don't match between shots | Draw on the site's own ground color; the build puts every segment on one brightness scale; `qa.py` measures it |
| Long labels on a ring or a shape | Short labels sitting on their own ring; the long version goes in the title. A label wider than its ring makes a circle read tall |
| A small logo beside the name (reads as a letter) | Logo in its own app-icon tile, above the name; the name arrives after it |
| A number on screen you haven't re-checked that day | Re-check every number against its live source on render day |
| "Done" before a cold viewer has watched it | Test it; their "what's this for?" is the finish line |
| Paid generation without a yes and a number | `gen.py` without `--yes` prints the cost; ask |
| Re-submitting a paid job because the log went quiet | It prints every poll; a failed poll is "unknown". Check the vendor dashboard first |

If the reel says it was made by an agent ("This video? Same agent."), that line is only true while the
agent does the whole edit. If the human polishes it in an editor, cut the line.

## Output

The reel folder, holding `out/<name>-vN.mp4`, `out/<name>-vN-cover.jpg`, `brainstorm-*.md`, `SCRIPT.md`,
`ledger.csv`, and everything needed to rebuild it. Report: what changed, what it cost (from the ledger),
what you checked by eye, and the cold-viewer reminder. For a second shape, copy `reel.json`, flip `size`
(`[1920, 1080]` ↔ `[1080, 1920]`), re-record the pages, and build again: titles, scenes and the grid adapt.

---

Credits: the interview method (one question at a time, a recommended answer each, every answer written
to disk before the next) is adapted from Nate Herk's `grill-me` skill; the preflight check and the
interview-first rule follow his `scroll-craft` skill; checking every generated clip frame by frame before
the human sees it and keeping a running cost log come from his Higgsfield walkthrough. The rest was learned
the hard way over twelve versions of one reel.
