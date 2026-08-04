#!/usr/bin/env bash
# Publish the current site/index.html to https://abhinavdxt.github.io/protocol/
# Usage: ./deploy.sh "optional commit message"
set -e
cd "$(dirname "$0")"
msg="${1:-update}"
git add -A
git commit -q -m "$msg" || { echo "Nothing to deploy (no changes)."; exit 0; }
git push -q origin main
echo "Deployed. Live in ~30s at https://abhinavdxt.github.io/protocol/"
