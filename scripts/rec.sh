#!/usr/bin/env bash
# rec.sh — Record from GoXLR mic (or any PulseAudio/PipeWire source) into samples/<name>.wav
#
# Usage:  ./scripts/rec.sh vocals/scream
#         npm run rec -- vocals/scream
#
# Press Ctrl+C (or 'q') to stop the recording.

set -euo pipefail

# --- config ---------------------------------------------------------------
# Find your source name with:  pactl list sources short
# Common GoXLR source on Linux (goxlr-utility):
#   alsa_input.usb-GoXLR_GoXLR_000000000000-00.multichannel-input
# Override at call time: STRUDEL_REC_SOURCE="<source>" ./scripts/rec.sh ...
SOURCE="${STRUDEL_REC_SOURCE:-@DEFAULT_SOURCE@}"
SAMPLE_RATE="${STRUDEL_REC_RATE:-48000}"
CHANNELS="${STRUDEL_REC_CHANNELS:-1}"
# --------------------------------------------------------------------------

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <name>   (e.g. vocals/scream)" >&2
  exit 2
fi

name="$1"
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
out_path="$repo_root/samples/$name.wav"
out_dir="$(dirname "$out_path")"

mkdir -p "$out_dir"

if [[ -e "$out_path" ]]; then
  read -r -p "File exists: $out_path — overwrite? (y/N) " confirm
  [[ "$confirm" == "y" || "$confirm" == "Y" ]] || exit 1
fi

echo
echo "Recording from: $SOURCE"
echo "Output:         $out_path"
echo "Press 'q' or Ctrl+C to stop."
echo

exec ffmpeg -hide_banner \
  -f pulse -i "$SOURCE" \
  -ar "$SAMPLE_RATE" -ac "$CHANNELS" -c:a pcm_s16le \
  -y "$out_path"
