#!/usr/bin/env bash
# norm.sh — Loudness-normalize a sample (or a directory of samples) in-place.
#
# Uses ffmpeg's loudnorm filter targeting -16 LUFS. Creates .bak copies
# next to each file the first time it touches them.
#
# Usage: ./scripts/norm.sh samples/vocals/hit01.wav
#        ./scripts/norm.sh samples/vocals

set -euo pipefail

target_i="${TARGET_I:--16}"
target_tp="${TARGET_TP:--1.5}"
target_lra="${TARGET_LRA:-11}"

normalize_one() {
  local f="$1"
  [[ "$f" == *.wav ]] || return 0
  local bak="${f}.bak"
  local tmp="${f}.norm.wav"

  if [[ ! -e "$bak" ]]; then
    cp "$f" "$bak"
  fi

  ffmpeg -hide_banner -loglevel error -y \
    -i "$bak" \
    -af "loudnorm=I=${target_i}:TP=${target_tp}:LRA=${target_lra}" \
    -c:a pcm_s16le "$tmp"

  mv "$tmp" "$f"
  echo "normalized $f"
}

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <file_or_dir>" >&2
  exit 2
fi

target="$1"
if [[ -d "$target" ]]; then
  while IFS= read -r -d '' f; do normalize_one "$f"; done \
    < <(find "$target" -type f -name '*.wav' -print0)
elif [[ -f "$target" ]]; then
  normalize_one "$target"
else
  echo "Not found: $target" >&2
  exit 1
fi
