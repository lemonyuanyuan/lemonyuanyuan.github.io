#!/usr/bin/env bash
#
# Build web-sized copies of the academic page's GIFs and videos.
#
# Paper GIFs and demo videos are exported at full size (a 3-minute screen
# recording is ~70 MB), but the page shows them in a 240px column. Keep the
# originals in academic-source/images/_originals/; this writes a small copy
# with the same name into academic-source/images/, which is what _data/*.yml
# points at. Videos always come out as .mp4 (H.264, no audio) so every browser
# plays them. Jekyll skips _originals/ and git ignores it, so the full-size
# files never reach the site or the repo.
#
# Run it after dropping new files into academic-source/images/_originals/:
#
#     scripts/optimize-media.sh
#
# Uses ffmpeg and gifsicle inside Docker, so start OrbStack first.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/academic-source/images"

SRC_DIR="_originals"
# After changing these, delete the web copies in academic-source/images/ so
# they get rebuilt (the originals in _originals/ are never touched).
GIF_WIDTH=480     # 2x the 240px media column, for retina screens
VIDEO_WIDTH=480
VIDEO_CRF=30      # x264 quality: lower is sharper and bigger

docker info >/dev/null 2>&1 || { echo "Docker is not running (start OrbStack first)"; exit 1; }

shopt -s nullglob nocaseglob

web_name() {
  case "$1" in
    *.gif|*.GIF) echo "$1" ;;
    *) echo "${1%.*}.mp4" ;;
  esac
}

todo=()
for src in "$SRC_DIR"/*.gif "$SRC_DIR"/*.mp4 "$SRC_DIR"/*.mov "$SRC_DIR"/*.m4v "$SRC_DIR"/*.webm; do
  name="$(basename "$src")"
  out="$(web_name "$name")"

  # Skip if the web copy is already newer than the source.
  if [ -f "$out" ] && [ "$out" -nt "$src" ]; then
    continue
  fi
  todo+=("$name")
done

if [ ${#todo[@]} -eq 0 ]; then
  echo "Nothing to do — all web copies are up to date."
  exit 0
fi

docker run --rm -i \
  -v "$PWD":/images -w /images \
  -e SRC_DIR="$SRC_DIR" -e GIF_WIDTH="$GIF_WIDTH" \
  -e VIDEO_WIDTH="$VIDEO_WIDTH" -e VIDEO_CRF="$VIDEO_CRF" \
  alpine:3.20 sh -s -- "${todo[@]}" <<'EOF'
set -e
apk add --no-cache ffmpeg gifsicle >/dev/null
for name in "$@"; do
  src="$SRC_DIR/$name"
  case "$name" in
    *.gif|*.GIF)
      gifsicle -O3 --lossy=60 --colors 128 --resize-fit-width "$GIF_WIDTH" "$src" -o "$name" ;;
    *)
      ffmpeg -v error -y -i "$src" -an \
        -vf "scale='min($VIDEO_WIDTH,iw)':-2" \
        -c:v libx264 -preset slow -crf "$VIDEO_CRF" -pix_fmt yuv420p \
        -movflags +faststart "${name%.*}.mp4" ;;
  esac
done
EOF

total_before=0
total_after=0
for name in "${todo[@]}"; do
  out="$(web_name "$name")"
  before=$(stat -f%z "$SRC_DIR/$name")
  after=$(stat -f%z "$out")
  total_before=$((total_before + before))
  total_after=$((total_after + after))
  printf "  %-44s %6s KB -> %6s KB\n" "$name" "$((before / 1024))" "$((after / 1024))"
done

echo
echo "Total: $((total_before / 1024 / 1024)) MB -> $((total_after / 1024 / 1024)) MB"
