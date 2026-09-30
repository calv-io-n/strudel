# Workspace and live MIDI profiling

Measured on September 30, 2026 using a production build in headless Chromium with Chrome CPU profiles, DOM mutation counts, frame intervals, long-task observations, and captured Web Audio output. The larger fixture contains 24 patterns, 240 clips and eight tracks. MIDI events enter through a simulated Web MIDI controller; no physical MIDI or audio device was available.

## Results

These are individual local runs, not cross-machine benchmarks. JavaScript time is cumulative within each scenario; it is not total CPU or audio latency.

| Scenario | Before | After |
| --- | ---: | ---: |
| Demo idle, JavaScript time over five seconds | 117 ms | 19 ms |
| Demo idle, DOM mutation records | 6,633 | 5 |
| Large session idle, JavaScript time over five seconds | 272 ms | 18 ms |
| Large session playback plus 100 MIDI notes, JavaScript time over about 6.35 seconds | 754 ms | 250 ms |
| Large session playback plus MIDI, DOM mutation records | 12,624 | 776 |
| Typing during playback, long tasks before/after draft batching | 26 | 0 |
| Typing during playback, 95th-percentile frame interval | 83 ms | 17 ms |
| 150 mapped controller changes, JavaScript time before/after durable-write batching | 1,122 ms | 883 ms |

The typing and controller baselines were taken during the optimization work, after the initial playback fixes. Their elapsed scenarios vary with browser responsiveness. The final playback run sounded all 100 notes, with a 1.0 ms 95th-percentile event-to-oscillator-start call interval, audible captured output, and no clipping or page errors. This interval excludes hardware, driver, output buffering and speaker latency.

The recording run retained all 50 notes, their velocities (40–89), and valid start/end times. It still showed nine long tasks (maximum 98 ms), a 67 ms 95th-percentile frame interval, and a 10.6 ms event-to-oscillator-start interval. Earlier runs were faster, so recording responsiveness remains variable and needs physical-device testing. The final mapped controller value was verified in durable draft storage. Post-stop JavaScript heap after explicit garbage collection was approximately 21.8 MB; this short run does not establish long-term memory behavior.

## Changes

- Avoid unchanged transport DOM writes and skip full idle renders. Keep playback and recording feedback current.
- Cache CodeMirror document strings, dirty comparisons, and bounded tempo reconciliation results. Avoid full project normalization on recording clock reads.
- Ignore unrelated DOM mutations in overlay discovery and render MIDI event logs only while visible.
- Batch recovery writes after 180 ms of inactivity, with a one-second deadline during continuous editing. Explicit save and lifecycle flushes remain immediate.
- Keep mapped controller sound updates immediate while batching durable recovery writes.
- Preload session audio with bounded concurrency and reuse decoded raw/aligned takes at playback.

Autosave preserves staged edits. Save or Ctrl/Cmd+S validates and commits all workspaces and updates the playing song. Invalid code leaves saved playback intact.

## Reproduce

Build with source maps for readable CPU attribution:

```sh
npm run studio:build
npx vite build --config studio/vite.config.ts --sourcemap
node scripts/serve-static.mjs
```

In another terminal:

```sh
npm run studio:profile -- /tmp/studio-profile
```

The harness writes CPU profiles, screenshots and `summary.json`. It uses a fresh browser context and asserts audible playback, note/velocity retention, durable controller recovery and absence of page errors. Stop the static server before running `npm run studio:e2e`, which starts its own server on port 5185. Use a normal production build when source maps are not needed.
