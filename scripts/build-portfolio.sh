#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p portfolio

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker run --rm \
    -v "$ROOT/academic-source:/srv/jekyll" \
    -v "$ROOT/portfolio:/srv/portfolio" \
    jekyll/jekyll:4.2.2 \
    bash -c "cd /srv/jekyll && bundle install && bundle exec jekyll build --baseurl /portfolio --destination /srv/portfolio"
else
  cd academic-source
  bundle install
  bundle exec jekyll build --baseurl "/portfolio" --destination ../portfolio
fi

touch portfolio/.nojekyll
echo "Built to portfolio/ — preview at https://lemonyuanyuan.github.io/portfolio/ after push"
