// Re-push patterns/scratch.strudel into the running strudel-server watcher
// without editing file contents. Use when the Strudel browser gets stuck,
// Web Audio stalls, or the REPL ate an error and you want a fresh eval
// without touching VS Code (which would steal focus and risk an edit).
//
// How it works: strudel-server's fs.watch handler (node_modules/strudel-server
// /src/main.ts:354-402) debounces 150ms and skips if stats.mtimeMs is
// unchanged. On Linux, fs.watch surfaces IN_ATTRIB, so bumping mtime via
// fs.utimesSync fires a change event without rewriting contents — VS Code's
// external-change watcher compares contents and stays quiet.

import { existsSync, statSync, utimesSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ANSI = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = path.join(repoRoot, "patterns", "scratch.strudel");

if (!existsSync(scratch)) {
  console.error(ANSI.red(`[reload] not found: ${scratch}`));
  process.exit(1);
}

const pgrep = spawnSync("pgrep", ["-f", "strudel-server/src/main.ts"], {
  encoding: "utf8",
});
if (pgrep.status !== 0) {
  console.warn(
    ANSI.yellow(
      "[reload] no strudel-server process found — is `npm run dev` running?",
    ),
  );
}

const now = new Date();
const { atime } = statSync(scratch);
utimesSync(scratch, atime, now);

console.log(
  ANSI.green(
    `[reload] bumped mtime on ${path.relative(repoRoot, scratch)} — watcher should re-push within ~200ms`,
  ),
);
