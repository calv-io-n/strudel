# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A personal live-coding music workspace built around [Strudel](https://strudel.cc/). The user edits `.strudel` files in VS Code and hears the result in a browser within ~200ms. The full background and composer's workflow are in `README.md` and `COMPOSER.md` — read those for context, especially `COMPOSER.md` if the user asks anything about *making music* rather than the toolchain.

The user is on **Linux** with a **GoXLR** mixer and uses this for both noodling and live streaming via OBS.

## Commands

```bash
npm install                       # also runs postinstall — see below
npm run dev                       # daily driver: sampler + watcher under concurrently
npm run sampler                   # sampler only (foreground)
npm run watch                     # file watcher only (foreground)
npm run reload                    # safely re-push patterns/scratch.strudel to the browser (no edit)

npm run patch-strudel-server      # re-apply the upstream selector patch (idempotent)
npm run ensure-deps               # re-run bun + chromium + ffmpeg + yt-dlp readiness check

npm run rec -- vocals/<name>      # record from PulseAudio source into samples/<name>.wav
npm run yt  -- <url> [name] [range]   # pull audio from YouTube into recordings/
npm run chop -- <input> <outdir>  # split a recording on silence
npm run trim -- <input> <s> <d> <name>  # cut a time range
npm run norm -- <file_or_dir>     # loudness-normalize .wav files in place (.bak preserved)
```

There are no tests, no linter, no build step. The repo is configuration + scripts, not an application.

## Architecture: the three-process dev stack

`npm run dev` runs `concurrently` with two children, but at runtime there are **three processes** doing real work:

1. **`@strudel/sampler`** (Node, port `5555`) — serves files from `./samples` over HTTP. **Rescans the directory on every request** — new `.wav` files appear without restarting. Real flags are `--dir <path>` (not `--path`) and `PORT=<n>` is an env var (no `--port` flag). Default port if unset is `5432`.

2. **`strudel-server`** (Bun + Playwright) — watches `patterns/scratch.strudel` via chokidar, launches a non-headless Chromium against `https://strudel.cc`, and pushes file contents into the page's CodeMirror editor on every save.

3. **Chromium** — the visible REPL window, also captured by OBS for streaming.

The data flow:

```
patterns/scratch.strudel  ──save──▶  strudel-server (Bun)
                                          │
                                          ▼ playwright.evaluate
                                    strudel.cc  ──Web Audio──▶  GoXLR
                                          ▲
                                          │ HTTP fetch
                                    @strudel/sampler ◀── ./samples/*.wav
```

`strudel-server` only ever watches **one** file: `patterns/scratch.strudel`. Saved compositions live in `patterns/sets/` and are copied in/out of the scratchpad by hand. This is intentional — see "single-file watcher model" in `COMPOSER.md`. **Don't** try to make the watcher follow multiple files; the workflow depends on the simplicity.

## Critical: the strudel-server selector patch

`strudel-server` is pulled from GitHub (`"strudel-server": "github:micahkepe/strudel-server"`), not npm. Its bin is a `.ts` file that **must** be run with Bun — that's why the `watch` script invokes `bun node_modules/strudel-server/src/main.ts ...` directly.

**Upstream `strudel-server` is broken against current `strudel.cc`.** It hardcodes `#code .cm-content[contenteditable='true']` as its editor selector, but strudel.cc removed the `#code` wrapper from its DOM (the editor is now under `.code-container`). Without intervention the watcher silently hangs for 30 seconds and times out.

`scripts/patch-strudel-server.mjs` rewrites all 7 occurrences of `#code` → `.code-container` in `node_modules/strudel-server/src/main.ts`. It runs from `postinstall` and is idempotent.

If a future Claude is debugging "watcher hangs / times out / can't find editor":

1. First check `grep -c "#code" node_modules/strudel-server/src/main.ts` — should be `0`.
2. If `>0`, run `npm run patch-strudel-server`.
3. If `0` and it still hangs, **strudel.cc may have changed its DOM again**. Run a Playwright probe against `https://strudel.cc` to find the new editor selector, update `scripts/patch-strudel-server.mjs` to target whatever the new wrapper is, and re-run.
4. **Do not delete the patcher** without first verifying upstream `strudel-server` has been fixed. When upstream does fix it, delete `scripts/patch-strudel-server.mjs`, remove its `postinstall` invocation, and the README/COMPOSER notes about it.

## `postinstall` chain (also critical)

`postinstall` runs:

```
node ./scripts/patch-strudel-server.mjs && node ./scripts/ensure-deps.mjs
```

`scripts/ensure-deps.mjs` checks four things and warns loudly (without failing) on each one that's missing:

1. **`bun`** — required by `npm run watch` because strudel-server's bin is a `.ts` file
2. **Playwright Chromium** — runs `node_modules/.bin/playwright install chromium` so the Chromium build matching strudel-server's pinned Playwright version is cached. Idempotent — Playwright is silent when the right build is already present. Skip with `STRUDEL_SKIP_PLAYWRIGHT_INSTALL=1`.
3. **`ffmpeg`** — required by `rec` / `chop` / `trim` / `norm` / `yt`
4. **`yt-dlp`** — required by `npm run yt`

Each missing tool prints a yellow warning with a copy-paste install command. Manual re-run: `npm run ensure-deps`.

If a future Claude is debugging "watcher errors with 'Executable doesn't exist at chromium-XXXX'", the fix is `npm run ensure-deps` (or `npm install`, which triggers it via postinstall).

Both postinstall scripts must remain **idempotent** and must **not exit non-zero on benign conditions** — they run on every `npm install` and a hard failure here breaks the boot. The "warn, don't fail" pattern is load-bearing: a fresh clone needs to be able to run `npm install` before its host has every CLI tool installed.

## Linux-specific assumptions

- All shell scripts in `scripts/` are **bash**, not PowerShell. The user is on Linux. Don't suggest Windows tooling.
- Audio capture goes through **PulseAudio / PipeWire** via `ffmpeg -f pulse`. The `rec.sh` source defaults to `@DEFAULT_SOURCE@` (whatever PulseAudio considers the current default input) but can be overridden with `STRUDEL_REC_SOURCE`. Find sources with `pactl list sources short`.
- The GoXLR is supported via [goxlr-utility](https://github.com/GoXLR-on-Linux/goxlr-utility), which exposes the GoXLR's faders and Broadcast Mix to PipeWire/PulseAudio. Without that daemon the GoXLR is just a generic USB sound card.

## Editing the `.strudel` scratchpad

VS Code is configured to treat `*.strudel` and `*.str` as JavaScript (see `.vscode/settings.json`). Strudel patterns are JavaScript that calls Strudel's pattern functions — the API reference lives at https://strudel.cc/learn/. The vocab the user actually uses is documented in `COMPOSER.md`'s "vocab you'll actually use" table — refer there before guessing function names.

## Things that look like bugs but aren't

- **`samples('http://localhost:5555')` returning `{}` from the sampler with no .wav files** — that's the empty-bank response. Drop a `.wav` into `samples/<bank>/`, fetch again, sampler returns the new index.
- **`patterns/sets/` files not being live-reloaded** — by design. Only `patterns/scratch.strudel` is watched. See "single-file watcher model" above.
- **The watcher's Chromium window stealing focus on every save** — Playwright's default. Acceptable for now since that window is the OBS visual.
- **`recordings/` and `samples/ai/` being gitignored** — intentional. Recordings are pre-chop staging; AI-generated samples are expected to churn.

## Where the user ignored the original spec

The README in the user's original message described a Windows/PowerShell setup with `winget`, `dshow`, and `.ps1` scripts. **All of that has been replaced** with Linux equivalents (apt/pacman/dnf, PulseAudio, bash). When the user references "the spec", they mean the conceptual layout (directory structure, npm scripts, editor flow), not the literal Windows commands.
