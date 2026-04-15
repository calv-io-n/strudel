# COMPOSER.md

How to actually use this repo to make music. Sit down, hit `npm run dev`, and
follow the flow below.

---

## The mental model

```
strudel-studio/
├── patterns/         ← code lives here. one file = one piece.
│   ├── scratch.strudel    ← noodle pad. always loaded by `npm run dev`.
│   └── sets/              ← finished/named pieces. copy from scratch when ready.
│
├── samples/          ← .wav files served at http://localhost:5555
│   ├── vocals/            ← your voice / chops
│   ├── drums/             ← your drum hits
│   ├── bass/              ← bass one-shots
│   ├── keys/              ← melodic one-shots
│   ├── fx/                ← textures, risers, sweeps
│   ├── field/             ← field recordings, room tone
│   └── ai/                ← gitignored, free for AI experiments
│
├── recordings/       ← raw mic takes before chopping. gitignored.
│
└── scripts/          ← shell helpers: rec, chop, trim, norm
```

Two folders matter day-to-day:

- **`patterns/`** — what you edit in VS Code
- **`samples/`** — what those patterns play

Everything else is plumbing.

### Why `scratch.strudel` is special

`npm run dev` always watches `patterns/scratch.strudel` and pushes its
contents into the browser on save. **Open VS Code, edit that file, save, hear
sound.** That's the entire daily loop.

When a noodle is good enough to keep, copy it into `patterns/sets/` with a
real filename (e.g. `patterns/sets/midnight_drive.strudel`). The scratchpad
stays empty for the next idea.

> `patterns/sets/` files are not auto-watched. To work on one of them, copy
> its contents back into `scratch.strudel`, edit there, then commit back when
> you're done. That keeps the live-reload loop dead simple — one watched file,
> always the same.

---

## Starting a new piece (the 30-second version)

1. `npm run dev` — sampler + watcher + Chromium pop up.
2. In VS Code, open `patterns/scratch.strudel`.
3. Replace the contents with anything below.
4. `Ctrl+S`. Sound should change within ~200ms.
5. When you like it: copy file → `patterns/sets/<name>.strudel`.

### When the browser gets stuck

If Web Audio stalls or the REPL eats an error mid-session, run
`npm run reload` from another terminal. It bumps the mtime on
`patterns/scratch.strudel` without changing a single byte — the watcher
re-pushes the current file into Chromium and the pattern re-evaluates.
No focus steal, no risk of an accidental keystroke in VS Code.

---

## The shortest possible song

```javascript
samples('github:tidalcycles/Dirt-Samples')

$: s("bd*4")
```

Four kicks per cycle. That's a song. Save and you're already further than
most people get.

---

## Building up a piece, layer by layer

Each `$:` line is its own parallel channel — Strudel runs them all
simultaneously. Comment out a layer with `//` to mute it. **Saving with a
layer commented = instant arrangement.**

```javascript
samples('http://localhost:5555')                  // local samples
samples('github:tidalcycles/Dirt-Samples')        // community kit

// 1. start with a beat
$: s("bd sd bd [sd bd]")
   .bank("RolandTR909")

// 2. add a hat
$: s("hh*8")
   .gain(0.3)
   .bank("RolandTR909")

// 3. drop a bassline
$: note("c2 c2 eb2 g2")
   .s("sawtooth")
   .lpf(600)
   .gain(0.6)

// 4. bring in your voice (assuming you've recorded samples/vocals/scream.wav)
$: s("vocals:0")
   .chop(8)              // slice the sample into 8 pieces
   .speed("1 1.5 0.75 2")  // play those pieces at varying speeds
   .gain(0.7)

// 5. spacey pad on top
$: note("c3 eb3 g3 bb3")
   .s("sawtooth")
   .lpf(800)
   .room(0.5)
   .gain(0.4)
```

Mute / unmute layers by toggling the `//` and saving. Live arrangement = code
edits. There is no separate sequencer view.

---

## The vocab you'll actually use

Pulled straight from the patterns above and from [strudel.cc/learn](https://strudel.cc/learn):

| Function          | What it does                                                  |
|-------------------|---------------------------------------------------------------|
| `samples(url)`    | Loads a sample bank. Call multiple times for multiple banks.  |
| `s("a b c")`      | Plays samples named `a`, `b`, `c` in sequence per cycle.      |
| `s("hh*8")`       | Plays `hh` 8 times per cycle. `*N` = repeat.                  |
| `s("a [b c]")`    | Brackets group: `a` then `b c` packed into the same slot.     |
| `note("c3 e3 g3")`| Plays notes. Pair with `.s("sawtooth")` to pick a synth.      |
| `$: …`            | Marks the line as its own parallel channel (a "layer").       |
| `.bank("...")`    | Picks a sample bank prefix, e.g. `RolandTR909`.               |
| `.gain(N)`        | Volume, 0–1.                                                  |
| `.chop(N)`        | Slices a sample into N equal pieces.                          |
| `.speed("...")`   | Playback speed per slice. Negative = reverse.                 |
| `.lpf(N)`         | Low-pass filter cutoff in Hz.                                 |
| `.room(N)`        | Reverb amount, 0–1.                                           |

The full reference (with sound previews) lives at https://strudel.cc/learn/.
When you want to do something this table doesn't cover, look there first.

---

## Recording your voice into a piece

This is the loop you'll repeat constantly:

```bash
# 1. Record a take. Press q (or Ctrl+C) to stop.
npm run rec -- vocals/scream

# 2. (optional) Chop a long take into pieces on silence
./scripts/chop.sh recordings/session.wav samples/vocals/chops

# 3. (optional) Cut a precise slice
./scripts/trim.sh recordings/session.wav 2.5 0.8 vocals/hit01

# 4. (optional) Loudness-normalize the bank so things sit in the mix
./scripts/norm.sh samples/vocals
```

Then in your `.strudel` file:

```javascript
$: s("vocals:0")     // first .wav alphabetically inside samples/vocals/
   .chop(16)
   .speed("1 1 0.5 2 -1 1")
```

The sampler **rescans on every request**. No restart needed. Save the file
and the new sample is in the mix.

> The `vocals:0` index is "first wav in the `vocals` bank, in directory
> order". `vocals:1` is the second, and so on. To target a sample by name
> instead, put it in its own subfolder (`samples/vocals/scream/scream.wav`)
> and use `s("scream")`.

---

## Sample sources

### Your own (local, served at http://localhost:5555)

Drop `.wav` files anywhere under `samples/`. The folder name becomes the
bank name. So:

```
samples/vocals/scream.wav    → s("vocals")  or s("vocals:0")
samples/drums/909/kick.wav   → s("909")     or s("909:0")
samples/fx/sweep.wav         → s("fx")      or s("fx:0")
```

### Community packs (no download — fetched on demand)

```javascript
samples('github:tidalcycles/Dirt-Samples')   // the classic Tidal kit
samples('github:yaxu/clean-breaks')          // breakbeat collection
samples('github:eddyflux/crate')             // crates of one-shots
samples('github:switchangel/pad')            // pads / textures
```

Browse the catalogue: https://therebelrobot.github.io/open-strudel-samples/

### Pulled from YouTube

`scripts/yt.sh` (alias `npm run yt`) wraps `yt-dlp` and drops the audio into
`recordings/` as a 48 kHz wav, ready for the same chop/trim/norm chain you use
on your own mic recordings:

```bash
# Whole video, named output
npm run yt -- "https://youtu.be/dQw4w9WgXcQ" rare_breaks

# Just one moment (saves bandwidth on long videos) — start-end as M:SS-M:SS
npm run yt -- "https://youtu.be/dQw4w9WgXcQ" vocal_take 0:43-1:08

# Then process like any other recording:
./scripts/chop.sh recordings/rare_breaks.wav samples/drums/rare_breaks
./scripts/norm.sh samples/drums/rare_breaks
```

YouTube serves audio at ~160 kbps Opus / ~128 kbps AAC — there is no lossless
source, but for sampling (chops, filters, time-stretching) it's plenty. The
script pulls the original best-audio stream and converts once to wav. From
there, everything stays as `pcm_s16le` so you don't compound lossy passes.

> Personal sampling is fine. If you ever release or stream tracks that contain
> identifiable samples, that's a per-track copyright conversation — think it
> through case by case.

You can call `samples()` as many times as you want — each call adds to the
in-memory bank. Local first, then community, gives you priority on overlapping
names.

---

## Useful composition patterns

Patterns I keep coming back to. Steal liberally.

### "Live arrangement by commenting"

The Strudel idiom for arrangement is muting/unmuting `$:` channels by toggling
`//`. There's no timeline — your save events *are* the timeline. For a
recorded performance, just save in the order you want sections to enter/exit.

### "Slow build, sudden drop"

Start with one layer commented in. Save. Add another. Save. Keep going. When
the energy peaks, comment everything *except* one element. Save. That's a drop.

### "Scratchpad → set"

When a noodle is keeping you up at night, copy it into `patterns/sets/` so the
scratchpad is free for the next idea. You can have a hundred sets. Open one
later by pasting it back into `scratch.strudel`.

### "Reuse a vocal across pieces"

Drop your favorite vocal one-shots into `samples/vocals/` (not into a per-set
folder). They're now available to every piece in the repo, automatically.

### "AI samples without polluting git"

`samples/ai/` is gitignored. Generate, dump in, reference as `s("ai:0")`.
When something's worth keeping forever, move it into `samples/vocals/` (or
wherever it belongs) so it gets committed.

---

## Saving and reopening pieces

There's no DB and no metadata layer. A piece is just a text file.

```bash
# Save the current scratchpad as a real piece
cp patterns/scratch.strudel patterns/sets/midnight_drive.strudel
git add patterns/sets/midnight_drive.strudel
git commit -m "midnight drive v1"
```

To reopen:

```bash
cp patterns/sets/midnight_drive.strudel patterns/scratch.strudel
# ...edit, save, hear it...
cp patterns/scratch.strudel patterns/sets/midnight_drive.strudel  # save back
```

If you don't like the copy-back step, you can also just open the set file
directly in VS Code and **paste its contents into `scratch.strudel`** every
time you want to play it. Slightly more friction but no risk of losing
in-progress edits.

---

## When you're ready to perform / record / stream

The audio path is set up so you don't have to think about it:

1. **Strudel REPL** plays into Chrome's audio output.
2. **Chrome** is routed to the GoXLR "Music" sink (see GoXLR Routing in README).
3. **Your mic** runs into the GoXLR's "Mic" fader.
4. **OBS** captures the GoXLR Broadcast Mix as a single audio source plus a
   window capture of the visible Strudel REPL window.

So while you're composing in VS Code, the same Chromium window the watcher
launched is *literally the visual* for your stream. You don't switch contexts
between "composing" and "streaming" — they're the same activity.

To capture audio-only without OBS:

```bash
# Find your GoXLR Broadcast Mix sink monitor (or any output you can hear)
pactl list sources short | grep monitor

# Record what you're hearing
ffmpeg -f pulse -i <monitor_source> -ac 2 -c:a pcm_s16le takes/$(date +%F_%H%M).wav
```

---

## Daily flow, one more time

1. `npm run dev` (or VS Code → `Ctrl+Shift+B` → "Start Studio")
2. Edit `patterns/scratch.strudel`, save, listen, repeat
3. Need a vocal? `npm run rec -- vocals/<name>`, speak, `q`
4. Reference the new sample in code, save, hear it (no restart)
5. When the noodle becomes a piece: `cp patterns/scratch.strudel patterns/sets/<name>.strudel`
6. Commit. Move on.

That's the whole composer's workflow. Everything else is just decoration.
