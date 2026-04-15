#!/usr/bin/env bash
# chop.sh — Split a recording on silence into numbered chunks.
#
# Usage: ./scripts/chop.sh recordings/session.wav samples/vocals/chops
#
# Tweak NOISE / DURATION to taste:
#   NOISE    — dB below which audio is considered silence (default -35dB)
#   DURATION — minimum silence length to trigger a split, seconds (default 0.4)

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <input.wav> <output_dir>" >&2
  exit 2
fi

input="$1"
out_dir="$2"
noise="${NOISE:--35dB}"
duration="${DURATION:-0.4}"

[[ -f "$input" ]] || { echo "Input not found: $input" >&2; exit 1; }
mkdir -p "$out_dir"

base="$(basename "${input%.*}")"

ffmpeg -hide_banner -i "$input" \
  -af "silenceremove=start_periods=1:start_silence=0.1:start_threshold=${noise}, \
       areverse, \
       silenceremove=start_periods=1:start_silence=0.1:start_threshold=${noise}, \
       areverse, \
       silencedetect=noise=${noise}:d=${duration}" \
  -f null - 2> "$out_dir/.silences.log"

# Parse silence boundaries and export segments
awk '
  /silence_start/ { start=$NF; next }
  /silence_end/   { end=$NF;   print prev_end, start; prev_end=end }
  END             { print prev_end, "end" }
' "$out_dir/.silences.log" > "$out_dir/.segments.log"

i=0
while read -r seg_start seg_end; do
  [[ -z "$seg_start" ]] && continue
  out="$out_dir/${base}_$(printf '%03d' "$i").wav"
  if [[ "$seg_end" == "end" ]]; then
    ffmpeg -hide_banner -loglevel error -y -i "$input" -ss "$seg_start" -c copy "$out"
  else
    ffmpeg -hide_banner -loglevel error -y -i "$input" -ss "$seg_start" -to "$seg_end" -c copy "$out"
  fi
  echo "wrote $out"
  i=$((i + 1))
done < "$out_dir/.segments.log"

rm -f "$out_dir/.silences.log" "$out_dir/.segments.log"
echo "Done. $i chunks in $out_dir"
