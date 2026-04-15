#!/usr/bin/env bash
# yt.sh — Pull the best audio stream from a YouTube URL into recordings/<name>.wav,
# ready to feed into chop.sh / trim.sh / norm.sh.
#
# Usage:
#   ./scripts/yt.sh <url>
#   ./scripts/yt.sh <url> <name>
#   ./scripts/yt.sh <url> <name> <start-end>     # time range, e.g. 0:30-1:15
#
# Examples:
#   ./scripts/yt.sh "https://youtu.be/dQw4w9WgXcQ"
#   ./scripts/yt.sh "https://youtu.be/dQw4w9WgXcQ" rick
#   ./scripts/yt.sh "https://youtu.be/dQw4w9WgXcQ" rick_chorus 0:43-1:08
#
# Quality notes:
#   - YouTube serves Opus (~160 kbps) or AAC (~128 kbps). There is no lossless
#     source. We pull the highest-bitrate original audio track (`-f bestaudio`)
#     and convert ONCE to 48 kHz wav. Re-encoding the wav further is lossy.
#   - For sampling (chops, filters, time-stretching) this is plenty.
#
# A note on rights:
#   - Personal sampling is fine. Live streaming / publishing finished tracks
#     that contain recognizable samples is a different conversation per track.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <url> [name] [start-end]" >&2
  echo "Example: $0 https://youtu.be/abc rick_chorus 0:43-1:08" >&2
  exit 2
fi

url="$1"
name="${2:-}"
range="${3:-}"

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
out_dir="$repo_root/recordings"
mkdir -p "$out_dir"

# Build yt-dlp args
ytdlp_args=(
  -f "bestaudio"
  -x
  --audio-format wav
  --audio-quality 0
  --no-playlist
  --restrict-filenames
)

if [[ -n "$range" ]]; then
  # yt-dlp --download-sections wants "*MM:SS-MM:SS" (the `*` means "from this clip")
  ytdlp_args+=(--download-sections "*${range}")
fi

if [[ -n "$name" ]]; then
  out_path="$out_dir/${name}.wav"
  ytdlp_args+=(-o "$out_path")
  if [[ -e "$out_path" ]]; then
    read -r -p "File exists: $out_path — overwrite? (y/N) " confirm
    [[ "$confirm" == "y" || "$confirm" == "Y" ]] || exit 1
    rm -f "$out_path"
  fi
else
  # Let yt-dlp use the video title (sanitized via --restrict-filenames)
  ytdlp_args+=(-o "$out_dir/%(title).100s.%(ext)s")
fi

echo
echo "Pulling audio from: $url"
[[ -n "$range" ]] && echo "Range:              $range"
echo "Destination:        $out_dir/"
echo

yt-dlp "${ytdlp_args[@]}" "$url"

# Find the file we just wrote, normalize sample rate to 48k mono-or-stereo-as-is.
# yt-dlp's wav output already uses ffmpeg, so the conversion happened — we just
# print where it landed and what to do next.
if [[ -n "$name" ]]; then
  final="$out_path"
else
  # Pick the most recently modified .wav in recordings/
  final="$(ls -t "$out_dir"/*.wav 2>/dev/null | head -1 || true)"
fi

if [[ -z "${final:-}" || ! -f "$final" ]]; then
  echo "yt-dlp completed but no .wav found in $out_dir — check output above." >&2
  exit 1
fi

echo
echo "Saved: $final"
echo
echo "Next steps:"
echo "  # split it on silence into a sample bank:"
echo "  ./scripts/chop.sh \"$final\" samples/<bank>/$(basename "${final%.wav}")"
echo
echo "  # or grab one specific moment:"
echo "  ./scripts/trim.sh \"$final\" <start_sec> <duration_sec> <bank>/<hit_name>"
echo
echo "  # then loudness-normalize the bank:"
echo "  ./scripts/norm.sh samples/<bank>"
