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
npm install                      # HyperFrames (renders the reel), GSAP, and puppeteer (records pages). Node 22+
pip install numpy                # for beats.py
node doctor.mjs                  # says plainly what's missing
node fonts.mjs "Archivo"         # or the brand's Google Font; then set reel.json → font.css
node fonts.mjs "JetBrains Mono" 500,700   # the small label face (reel.json → mono)
```

Everything runs from the reel folder and reads one file, `reel.json`: size, palette, font, music grid,
titles, scenes, page recordings, and the segment list. Edit that file; don't edit the scripts per reel.
`build.mjs` turns it into ONE [HyperFrames](https://github.com/heygen-com/hyperframes) composition (an HTML page
with a single GSAP timeline, `comp/index.html`) and renders it frame by frame in headless Chrome, music included.
HyperFrames is free and open source; `build.mjs` turns off its anonymous telemetry.
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
   the human watches their face. And: anything that must never appear on screen (pages go in reel.json →
   `"never"`, and the build refuses them).

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

- **Drawn scenes** (`reel.js`): `chat` (a session that keeps forgetting), `hub` (the thing in the
  middle, its layers as rings, then everything it connects to), `sources` (a claim wiring down to the
  evidence behind it), `endcard` (the mark in a tile, drawing itself, then the name and the address).
  Change their words in `reel.json → scenes`; write a new scene when the story needs a picture of something
  real that has no footage — an animated diagram of the real thing beats any metaphor.
- **Page recordings** (`record.mjs`): smooth scrolls of real pages, at phone size for vertical. Already have
  a screen recording? Point the shot at it: `{"video": "my-capture.mp4"}` or a folder of frames `{"dir": …}`.
- **Titles and cards**: real text in the page. `<br>` breaks a line, `<span class=a>` paints the accent,
  `<span class=apart>` makes a word's letters drift apart, `"size": 0.9` shrinks one long title, and a card's
  `"at": [0, 1, 2]` brings each line in on its own beat. Kinds: `lower`, `card`, `stat` (a big number that counts
  up, with a line under it).
- **Free push-ins** on any still: `{"still": "stills/x.jpg"}`, `"push": 0.06` on the segment.
- **The collage** (`collage.mjs`): sixteen different pieces of the thing's own work, as tiles at the reel's shape.
  Real postings (cover, kicker, title) and real visuals (dashboards, charts, diagrams, UI), laid out as a
  checkerboard so no two neighbors are the same kind. Capture them at the reel's shape (phone width for vertical,
  desktop for widescreen), with sticky bars hidden. Never frames of the reel itself: a wall of the
  reel's own scenes reads as repetition, and the note back was "showcase everything it has to offer".

**How it moves: max the motion on the picture, never on reading time.** A reel reads as crafted when the
frame never simply swaps. Same story, words, cuts and music; everything else moves. The full vocabulary is in
`build.mjs`'s header. What every reel gets:

- **One motif carried through**, the brand's most reduced element (for example, the colored point in a logo,
  carried from a chat's send button all the way to the logo itself at the end).
- **A camera that hits with the drums.** It punches in on the big hits (onset strength per beat; the band under
  150 Hz marks the kicks, `"punches"` adds more). The words live outside the camera and never shake. Scenes are 3D:
  the chat tilts, the hub starts as a tilted close-up and swings face-on, the sources board orbits.
- **Nothing hard-cuts; segments hand off.** Each segment's `"in"`: for pages `rise` (swings up like a raised
  phone), `swing` (carousel), `depth` (fly-through), `flip`, `drop`; for the rest `whip` / `whipx`, `zoom` (dives
  through a card), `dot` (collapses into the motif point, which hits on the beat), `flash`, `fade`, `over` (a card
  lands on the previous segment). Vary them: five pages in a row with five different hand-offs is what makes it pop.
- **Things arrive from somewhere.** Tools fly in along their spokes, source cards from the sides, collage tiles
  from every direction; a card's letters can `shatter` at the cut. Never across the words.
- **The collage is the set piece:** the wall lands in 3D under a sweeping camera, a playhead runs the tiles in
  order, the next card lands `over` it, and the wall collapses into the motif point.
- **One emphasis per key word, on the beat, after it lands:** `box` (a marker behind it), `check`, `beats` (dots
  lighting per beat), `ruler` (a marker snaps on the drop), `pulse`. Plus `spark` on stats.
- Every hold gets a slow push, words rise in one at a time, and a seeded grain, a vignette, a drifting dot texture
  and dust in the light finish it.

Keep titles on screen about two seconds anyway: fast motion is not fast reading. Left out on purpose: a HUD (it
sits where phones hide things), sub-second word flurries, and sound effects.

**Storyboard before you render.** `node build.mjs --storyboard` snapshots a hero frame of every segment and
title into `qa/storyboard.jpg` in seconds, without rendering. Look at every frame, fix, repeat. It is the
cheapest place to catch a misplaced shape or a word in the wrong spot.

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
node build.mjs                       # prepares footage and music, checks, renders out/<name>-v<N>.mp4 + cover
python3 qa.py out/<name>-v1.mp4      # contact sheet, first frame, phone safe zone, a strip per transition,
                                     # blacks per segment, audio continuity
```

**Vertical reels: keep every word in the phone safe zone.** Stay at 1080×1920, but a modern phone is
taller than 9:16, so full-screen players (LinkedIn's, measured) fill the height and crop about 9% off each
side. The like/comment/share rail covers the right fifth below 62% height, the name, caption and scrubber
cover the bottom 16%, and the status bar the top 10%. So words live in x 11–89%, y 10–84%, and below 62%
height they stop at x 80%. The kit handles most of it: `build.mjs` warns on any title or card outside the zone,
drawn scenes and the grid stay inside it, and page recordings shrink to 78% on the ground color so their
text clears the side crop (`shot_inset` in `reel.json` for all of them, or `"inset"` on one shot's entry;
`1` turns it off). The bottom of a page recording still sits under the caption, so `qa.py` writes
`qa/<name>-safe.jpg` with the hidden areas in red: look at it. Nothing you need to read may touch red.

**Every ⚠️ the build or `qa.py` prints is a note a human once had to give.** Before rendering, `build.mjs`
checks the safe zone, an emphasis with no word to land on, a check mark sitting on its word, a marker split by a
line break, a font that never loaded, collage tiles that are frames of this reel or the same picture twice, and
any `never` page; `collage.mjs` refuses repeats. After rendering, `qa.py` flags a big pure-black patch near a cut
(a page painted outside its slot). Fix it; don't explain it.

**Look at `qa/<name>-cuts.jpg` before anyone else sees the cut.** It is one ten-frame strip per transition:
ghosted titles, a line arriving early, an empty frame or a flash of black show up there and nowhere else, because
a one-per-second sheet steps right over them. Then look at the frames around each move at full size for what no
script can judge: a reflection that doesn't track one fixed light, more than one ring per moment, a line that starts
on a card but runs behind it, flowing data too small to see on a phone. Fix, render again (about a minute), look again. The reel in the
README went through that loop twice before a human saw it.

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
| Words at the edges of a vertical reel | Keep them in the phone safe zone; check `qa/<name>-safe.jpg` |
| Hard cuts everywhere, a frame that sits still | Transitions that transform the frame; a slow push on every hold |
| "Done" from a one-per-second contact sheet | Look at every transition strip in `qa/<name>-cuts.jpg` |
| Blacks that don't match between shots | Draw on the site's own ground color; the build puts every segment on one brightness scale; `qa.py` measures it |
| Long labels on a ring or a shape | Short labels sitting on their own ring; the long version goes in the title. A label wider than its ring makes a circle read tall |
| A small logo beside the name (reads as a letter) | Logo in its own app-icon tile, above the name; the name arrives after it |
| A number on screen you haven't re-checked that day | Re-check every number against its live source on render day |
| "Done" before a cold viewer has watched it | Test it; their "what's this for?" is the finish line |
| A highlight measured before the web font loads | Hang every emphasis off its word, sized in em. A width read at build time is the fallback font's: the marker came up short of its word and the check mark sat on it |
| A glare that sweeps on its own | Compute it from the surface's tilt, as if one light is fixed in the room. A free sweep "appears on one side, goes away, then appears on the other" |
| A shockwave ring on every line | One ring per moment; the repeats read as "a bit much" |
| Lines that start on a card and run behind it; one pass of tiny dots | Draw them over the card; flowing data needs a head, a glow, a tail and a steady stream to read on a phone |
| A collage of the reel's own frames | Sixteen different pieces of the thing's own work; never the page that says the closing line |
| A page that flies in before its slot and shows as a black box | The kit plays every clip from 0.4 s before its cut to 0.45 s after; `qa.py` flags black holes near cuts |
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
the human sees it and keeping a running cost log come from his Higgsfield walkthrough. The motion grammar (one
motif carried through, transitions that transform the frame, a camera that never sits still) and the render-
then-inspect-every-transition loop come from his HyperFrames video and `hyperframes-student-kit`; storyboarding
hero frames before the full render comes from Jay E's (RoboNuggets) video on directing video with Opus 5.5.
Rendering is [HyperFrames](https://github.com/heygen-com/hyperframes) by HeyGen (Apache-2.0) with GSAP. The rest
was learned the hard way over twenty-two versions of one reel.
