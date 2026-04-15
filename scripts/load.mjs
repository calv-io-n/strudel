// Load patterns/sets/<name>.strudel into patterns/scratch.strudel.
//
// Usage:
//   npm run load -- <name>           # loads patterns/sets/<name>.strudel
//   npm run load -- <name> --force   # discard dirty scratch without asking
//
// Dirty check: before overwriting scratch, compare its contents against
// every file in patterns/sets/. If it matches at least one, it's a clean
// snapshot — safe to switch. If it matches nothing, it has unsaved work
// and we refuse unless --force, telling the user how to save it first.
//
// Writing the new contents into scratch.strudel bumps mtime, so the
// strudel-server watcher re-pushes it into Chromium within ~200 ms —
// no manual reload needed.

import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ANSI = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = path.join(repoRoot, "patterns", "scratch.strudel");
const setsDir = path.join(repoRoot, "patterns", "sets");

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const positional = argv.filter((a) => !a.startsWith("--"));

function listSets() {
  if (!existsSync(setsDir)) return [];
  return readdirSync(setsDir)
    .filter((f) => f.endsWith(".strudel"))
    .sort();
}

function die(msg, code = 1) {
  console.error(ANSI.red(msg));
  process.exit(code);
}

if (positional.length === 0) {
  console.error(ANSI.red("[load] usage: npm run load -- <name> [--force]"));
  const sets = listSets();
  if (sets.length) {
    console.error("  available sets:");
    for (const s of sets) console.error(`    ${s.replace(/\.strudel$/, "")}`);
  } else {
    console.error("  (patterns/sets/ is empty)");
  }
  process.exit(1);
}

const rawName = positional[0];
const name = rawName.endsWith(".strudel")
  ? rawName.slice(0, -".strudel".length)
  : rawName;

if (name === "" || name.includes("/") || name.includes("\\") || name.startsWith(".")) {
  die(`[load] invalid name: ${JSON.stringify(rawName)}`);
}

const source = path.join(setsDir, `${name}.strudel`);
if (!existsSync(source)) {
  console.error(ANSI.red(`[load] not found: ${path.relative(repoRoot, source)}`));
  const sets = listSets();
  if (sets.length) {
    console.error("  available sets:");
    for (const s of sets) console.error(`    ${s.replace(/\.strudel$/, "")}`);
  }
  process.exit(1);
}

// Dirty check
if (!flags.has("--force") && existsSync(scratch)) {
  const scratchContents = readFileSync(scratch, "utf8");
  if (scratchContents.trim() !== "") {
    const sets = listSets();
    const matched = sets.some((f) => {
      try {
        return readFileSync(path.join(setsDir, f), "utf8") === scratchContents;
      } catch {
        return false;
      }
    });
    if (!matched) {
      console.error(
        ANSI.red(
          "[load] scratch has unsaved changes — doesn't match any file in patterns/sets/.",
        ) +
          `\n  Save it first:   ${ANSI.cyan("npm run save -- <name>")}` +
          `\n  Or discard it:   ${ANSI.cyan(`npm run load -- ${name} --force`)}`,
      );
      process.exit(1);
    }
  }
}

const contents = readFileSync(source, "utf8");
writeFileSync(scratch, contents);
console.log(
  ANSI.green(
    `[load] ${path.relative(repoRoot, source)} → ${path.relative(repoRoot, scratch)} (${contents.length} bytes)`,
  ),
);
console.log(
  ANSI.dim("  watcher will re-push to Chromium within ~200ms"),
);
