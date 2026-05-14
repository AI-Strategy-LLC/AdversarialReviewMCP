#!/usr/bin/env bash
# bin/deploy-local.sh — deploy the adversarial-review MCP server as a
# self-contained bundle, with no runtime dependency on this source checkout.
#
# Produces, under $DEST:
#   server.mjs   — single-file esbuild bundle (server + MCP SDK + zod)
#   prompts/     — review-skill prompt templates (read at runtime via import.meta.url)
#   guidance/    — architectural-guidance docs (read at runtime via import.meta.url)
#
# $DEST defaults to ${XDG_DATA_HOME:-$HOME/.local/share}/adversarial-review-mcp
# Override with $ADVERSARIAL_REVIEW_DEPLOY_DIR.
#
# Re-run any time after changing src/. The MCP registration points at a stable
# path (server.mjs), so a redeploy + a fresh client session is all that is
# needed to pick up changes — no re-registration.
#
# Usage:
#   npm run deploy:local
#   ADVERSARIAL_REVIEW_DEPLOY_DIR=/opt/ar npm run deploy:local
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${ADVERSARIAL_REVIEW_DEPLOY_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/adversarial-review-mcp}"

cd "${SCRIPT_DIR}"

if [[ ! -x node_modules/.bin/esbuild ]]; then
  echo "esbuild not found in node_modules — run 'npm install' first." >&2
  exit 1
fi

# Best-effort guidance refresh — graceful no-op if no canonical source is on
# disk (see bin/sync-guidance.sh for resolution order).
echo "==> Syncing architectural guidance into src/guidance/"
if ! bash "${SCRIPT_DIR}/bin/sync-guidance.sh"; then
  echo "    sync-guidance.sh failed — deploying with whatever is in src/guidance/" >&2
fi

echo "==> Bundling server with esbuild -> ${DEST}/server.mjs"
mkdir -p "${DEST}"
# --external:@cfworker/json-schema — optional peer dep of the MCP SDK; not
# installed, loaded dynamically only when present, so it must not be bundled.
node_modules/.bin/esbuild src/server.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --target=node20 \
  --external:@cfworker/json-schema \
  --outfile="${DEST}/server.mjs"
chmod +x "${DEST}/server.mjs"

echo "==> Staging runtime assets (prompts/, guidance/)"
rm -rf "${DEST}/prompts" "${DEST}/guidance"
cp -R src/prompts "${DEST}/prompts"
cp -R src/guidance "${DEST}/guidance"

# Smoke test: confirm the bundle actually starts and speaks MCP, rather than
# trusting that esbuild exiting 0 means a working server.
echo "==> Smoke-testing the bundle"
SMOKE_OUT="$(mktemp)"
( printf '%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"deploy-local","version":"0"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
  sleep 2 ) | node "${DEST}/server.mjs" > "${SMOKE_OUT}" 2>/dev/null &
SMOKE_PID=$!
sleep 3
kill "${SMOKE_PID}" 2>/dev/null || true
wait "${SMOKE_PID}" 2>/dev/null || true
if grep -q '"serverInfo"' "${SMOKE_OUT}" && grep -q '"adversarial_review"' "${SMOKE_OUT}"; then
  echo "    OK — server completed the MCP handshake and listed its tools"
  rm -f "${SMOKE_OUT}"
else
  echo "    FAILED — bundle did not respond to the MCP handshake; output at ${SMOKE_OUT}" >&2
  exit 1
fi

echo
echo "==> Deployed. Self-contained bundle ($(du -sh "${DEST}" | cut -f1)) at:"
echo "    ${DEST}"
echo
echo "Register once with your MCP client (later redeploys need no re-registration):"
echo "    claude mcp add -s user adversarial-review -- node ${DEST}/server.mjs"
echo
echo "If already registered, start a fresh client session to pick up the rebuilt bundle."
