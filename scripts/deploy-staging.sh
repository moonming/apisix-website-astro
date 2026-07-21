#!/usr/bin/env bash
# Deploy dist/ to ASF staging via the autostage mechanism:
# pushing branch preview/astro to apache/apisix-website publishes the tree at
#   https://apisix-astro.staged.apache.org/
# (.asf.yaml on master already has `staging.autostage: preview/*`.)
#
# Usage: npm run deploy:staging   (or: bash scripts/deploy-staging.sh)
# Requires: a fresh dist/ (npm run sync && npm run build && npm run check)
# and push access to apache/apisix-website (any APISIX committer).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${STAGING_REMOTE:-git@github.com:apache/apisix-website.git}"
BRANCH="${STAGING_BRANCH:-preview/astro}"

if [ ! -f "$ROOT/dist/index.html" ]; then
  echo "dist/ is missing or incomplete — run: npm run sync && npm run build" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R "$ROOT/dist/." "$TMP/"

git -C "$TMP" init -q
git -C "$TMP" checkout -q -b "$BRANCH"
git -C "$TMP" add -A
git -C "$TMP" -c user.email=wenming@apache.org -c user.name="Ming Wen" \
  commit -qm "preview: static Astro rebuild of apisix.apache.org (1294/1294 URL parity)

Built from https://github.com/moonming/apisix-website-astro"

# Force-push: the preview branch is a throwaway artifact, history is noise.
# HTTP/1.1 + big postBuffer: the ~3.5k-object site pack reliably trips curl's
# "HTTP2 framing layer" bug on this machine's https transport (insteadOf
# rewrites git@ URLs to https).
git -C "$TMP" -c http.version=HTTP/1.1 -c http.postBuffer=157286400 \
  push --force "$REMOTE" "$BRANCH:$BRANCH"

echo
echo "Pushed. ASF infra will stage it shortly (usually within a few minutes) at:"
echo "  https://apisix-astro.staged.apache.org/"
