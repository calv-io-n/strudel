// Save current patterns/scratch.strudel into patterns/sets/<name>.strudel
//
// Usage:
//   npm run save -- <name>           # writes patterns/sets/<name>.strudel
//   npm run save -- <name> --force   # overwrite existing set
//   npm run save -- <name> --clear   # wipe scratch after saving
//
// Refuses if the target already exists (use --force) or if scratch is empty.
// Accepts names with or without the .strudel suffix; strips it so the file
// on disk is always <name>.strudel.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ANSI = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = path.join(repoRoot, "patterns", "scratch.strudel");
const setsDir = path.join(repoRoot, "patterns", "sets");

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const positional = argv.filter((a) => !a.startsWith("--"));

function die(msg, code = 1) {
  console.error(ANSI.red(msg));
  process.exit(code);
}

if (positional.length === 0) {
  die("[save] usage: npm run save -- <name> [--force] [--clear]");
}

const rawName = positional[0];
const name = rawName.endsWith(".strudel")
  ? rawName.slice(0, -".strudel".length)
  : rawName;

if (name === "" || name.includes("/") || name.includes("\\") || name.startsWith(".")) {
  die(`[save] invalid name: ${JSON.stringify(rawName)}`);
}

if (!existsSync(scratch)) {
  die(`[save] not found: ${path.relative(repoRoot, scratch)}`);
}

const contents = readFileSync(scratch, "utf8");
if (contents.trim() === "") {
  die("[save] scratch is empty — nothing to save");
}

mkdirSync(setsDir, { recursive: true });
const target = path.join(setsDir, `${name}.strudel`);

if (existsSync(target) && !flags.has("--force")) {
  console.error(
    ANSI.red(`[save] ${path.relative(repoRoot, target)} already exists.`) +
      `\n  Pass ${ANSI.cyan("--force")} to overwrite, or pick a different name.`,
  );
  process.exit(1);
}

writeFileSync(target, contents);
console.log(
  ANSI.green(
    `[save] wrote ${path.relative(repoRoot, target)} (${contents.length} bytes)`,
  ),
);

if (flags.has("--clear")) {
  writeFileSync(scratch, "");
  console.log(
    ANSI.green(`[save] cleared ${path.relative(repoRoot, scratch)}`),
  );
}
