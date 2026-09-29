https://github.com/user-attachments/assets/634393ea-f13a-473c-b06a-6160c80d23dc

<p align="center">
  58 seconds, sound on. On a phone? Watch the <a href="media/lab-reel-vertical.mp4">vertical cut</a>.
</p>

# sizzle-reel

**A skill that lets your AI agent make a promo reel by itself**: the script, the music, the scenes, the
edit, and the quality check. You bring the idea and your notes. You never open a video editor.

The reel above was made this way, for [The Lab](https://lab.worthington.cloud). An agent wrote it, made the
music, drew every diagram and title in code, recorded the real website, prompted three short cinematic
shots, cut all of it to the beat, and checked every frame. It took seventeen versions to get right and about
$13 in generation costs. Every cut after the fourth was free. The latest version was rebuilt on
[HyperFrames](https://github.com/heygen-com/hyperframes): same story, words and music, but the frames now
flow into each other instead of cutting, and the whole reel renders in about a minute. This skill is what
those versions taught, packaged so your agent starts where that one finished.

## Install it

Paste this to your agent (Claude Code, or any agent that can run shell commands and has a skills folder):

```text
Install the sizzle-reel skill from https://github.com/WorthingtonCloud/sizzle-reel. Clone the repo and
copy its sizzle-reel/ folder into my skills folder (for Claude Code: ~/.claude/skills/sizzle-reel).
Then read its SKILL.md, set up a reel folder from its kit, run node doctor.mjs, and tell me what's
missing. When everything passes, interview me for my first reel.
```

Or by hand:

```bash
git clone https://github.com/WorthingtonCloud/sizzle-reel
cp -R sizzle-reel/sizzle-reel ~/.claude/skills/
```

**You need:** Node 22+, Python 3 with numpy, and a full build of ffmpeg. `npm install` in a reel folder brings
HyperFrames, GSAP and puppeteer. `doctor.mjs` checks all of it.
macOS and Linux run it as is; on Windows, run it under WSL.
**Only for paid shots and music:** a [kie.ai](https://kie.ai) key (music, stills, clips) and, for Seedance
clips, a [Higgsfield](https://higgsfield.ai) key as well (the kie.ai key still hosts the clip's input image).
Any image you turn into a clip or use as a reference is uploaded to kie.ai's file host, so don't use private
material there. A reel made from drawn scenes, recordings
of your own pages, and your own footage costs nothing.

## How it works

1. **The agent interviews you first.** One question at a time, each with its suggested answer, every
   answer saved to a file before the next: what the reel is for, what a stranger should get from it, the
   one line they should remember, what real material you have, the music, the budget.
2. **It pitches two or three stories** as beat sheets, recommends one, and waits for your pick.
3. **A $2 test** before any real spend: two music takes and one cheap draft shot. Your ears pick the music.
4. **It builds everything free first.** Diagrams and titles are drawn in code, so every word is sharp and
   nothing is garbled. Your real pages are recorded as smooth scrolls. Paid video is used only for a few
   textless mood shots. The whole reel is one HyperFrames page, so scenes can whip, zoom and dissolve into
   each other, and every word stays where a phone's crop and buttons can't hide it.
5. **It shows you a storyboard first**: a still of every scene, in seconds, before anything renders.
6. **Every cut lands on the beat.** The agent finds the music's beat grid and the first big hit, and the
   whole edit is built on it, with one continuous track underneath.
7. **It checks its own work before you see it**: every transition frame by frame, a contact sheet of every
   second, the first frame (the preview people see before they press play), where a phone would hide words,
   the black level of every shot, and whether the audio ever drops out. It fixes what it finds and renders
   again first.
8. **You show it to someone who has never seen it** and ask, "What's this for?" That answer is the test.

## What's in the box

| File | What it does |
|---|---|
| `sizzle-reel/SKILL.md` | The method: the interview, the steps, the cost gates, and the house rules |
| `kit/reel.json` | The whole reel in one file: size, colors, font, music grid, words, scenes, segment list |
| `kit/build.mjs` | Builds the reel on the beat grid as one HyperFrames composition, checks the phone safe zone, storyboards it, renders it with one continuous track and a cover image |
| `kit/reel.js` | The motion: drawn scenes (a chat that forgets, a hub-and-rings diagram, claims wired to sources, an end card), titles, transitions, grain |
| `kit/record.mjs` | Smooth scroll recordings of real web pages, at phone or desktop size |
| `kit/beats.py` | Finds the beat length and the first big hit, and which drum the grid lands on |
| `kit/qa.py` | The self-check: a strip per transition, contact sheet, first frame, phone safe zone, black levels, audio, clip QA |
| `kit/gen.py` | Paid music, stills and clips. Prints the cost and refuses to spend without `--yes`, logs every take |
| `kit/doctor.mjs` | Preflight: says plainly what's missing |

## The rules that cost a round of notes each

Text never comes from a video model. A metaphor that needs decoding loses to a diagram of the real thing.
The music never stops for a dramatic pause, because a viewer hears silence as a broken file. The first
frame is the preview, so the hook is on screen from frame one. The closing line is spent once. A number on
screen is re-checked the day it's rendered. A grid never has a hole in it. All the shots share one black.
The full list, with the fix for each, is in [SKILL.md](sizzle-reel/SKILL.md).

## Credits

The interview method is adapted from Nate Herk's `grill-me` skill, and the preflight check and
interview-first rule follow his [scroll-craft](https://github.com/nateherkai/scroll-craft). Checking
every generated clip before the human sees it, and keeping a running cost log, come from his Higgsfield
walkthrough. The motion grammar and the render-then-inspect loop come from his HyperFrames video and
[hyperframes-student-kit](https://github.com/nateherkai/hyperframes-student-kit); storyboarding before the
render comes from Jay E's (RoboNuggets) video on directing video with Opus 5.5. The reel renders on
[HyperFrames](https://github.com/heygen-com/hyperframes) by HeyGen (Apache-2.0) and [GSAP](https://gsap.com).

## License

MIT. Use it, change it, ship reels with it.
