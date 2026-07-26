#!/usr/bin/env bash
#
# Build web-sized copies of the album photos.
#
# Straight-off-the-camera files are 6048x4024 and 4-10 MB each, which makes an
# album page tens of megabytes. This writes a resized, re-compressed copy of
# every photo into a `web/` folder beside it; the pages load those, and the
# originals are never touched.
#
# Run it after dropping new photos into album/<name>/:
#
#     scripts/optimize-album-images.sh
#
# Uses sips, which ships with macOS.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/album"

MAX_EDGE=2000   # long edge in px — plenty for full-bleed display on retina
QUALITY=72      # sips JPEG quality (0-100)

command -v sips >/dev/null 2>&1 || { echo "sips not found (macOS only)"; exit 1; }

shopt -s nullglob nocaseglob

total_before=0
total_after=0

for dir in */; do
  dir="${dir%/}"
  [ "$dir" = "web" ] && continue

  photos=("$dir"/*.jpg "$dir"/*.jpeg "$dir"/*.png)
  [ ${#photos[@]} -eq 0 ] && continue

  mkdir -p "$dir/web"

  for src in "${photos[@]}"; do
    name="$(basename "$src")"
    out="$dir/web/${name%.*}.jpg"

    # Skip if the web copy is already newer than the source.
    if [ -f "$out" ] && [ "$out" -nt "$src" ]; then
      continue
    fi

    sips -Z "$MAX_EDGE" \
         -s format jpeg \
         -s formatOptions "$QUALITY" \
         "$src" --out "$out" >/dev/null

    before=$(stat -f%z "$src")
    after=$(stat -f%z "$out")

    # Already-small files (phone screenshots, WeChat exports) can come out
    # bigger after re-encoding. Keep whichever is smaller.
    if [ "$after" -ge "$before" ]; then
      cp "$src" "$out"
      after=$before
      printf "  %-44s %5s KB    (kept original)\n" "$name" "$((before / 1024))"
      total_before=$((total_before + before))
      total_after=$((total_after + after))
      continue
    fi
    total_before=$((total_before + before))
    total_after=$((total_after + after))

    printf "  %-44s %5s KB -> %5s KB\n" "$name" "$((before / 1024))" "$((after / 1024))"
  done
done

if [ "$total_before" -gt 0 ]; then
  echo
  echo "Total: $((total_before / 1024 / 1024)) MB -> $((total_after / 1024 / 1024)) MB"
else
  echo "Nothing to do — all web copies are up to date."
fi
