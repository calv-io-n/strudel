#!/usr/bin/env bash
# trim.sh — Extract a time range from a recording into a new sample.
#
# Usage: ./scripts/trim.sh <input.wav> <start> <duration> <output_relpath>
# Example: ./scripts/trim.sh recordings/session.wav 2.5 0.8 vocals/hit01

set -euo pipefail

if [[ $# -lt 4 ]]; then
  echo "Usage: $0 <input.wav> <start_sec> <duration_sec> <output_relpath>" >&2
  exit 2
fi

input="$1"
start="$2"
duration="$3"
name="$4"

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
out_path="$repo_root/samples/$name.wav"
mkdir -p "$(dirname "$out_path")"

ffmpeg -hide_banner -loglevel error -y \
  -ss "$start" -t "$duration" \
  -i "$input" \
  -c:a pcm_s16le "$out_path"

echo "Saved: $out_path"
