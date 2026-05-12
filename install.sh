#!/usr/bin/env bash
# Build and (optionally) register the adversarial-review MCP server with one
# or more MCP-aware CLIs.
#
# Usage:
#   bash install.sh                 # build only, print setup snippets
#   bash install.sh --for claude    # build + register with Claude Code
#   bash install.sh --for codex     # build + register with Codex
#   bash install.sh --for claude,codex
#
# The server is read-only on the repo, ambient-auth (each CLI uses its own
# session), and is intended to be invoked by Claude (or another MCP client)
# to dispatch review skills to a *different* CLI than the caller.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_NAME="adversarial-review"
SERVER_ENTRY="${SCRIPT_DIR}/dist/server.js"

TARGETS=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --for)
      TARGETS="$2"
      shift 2
      ;;
    --help|-h)
      grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -n 20
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

build_server() {
  echo "==> Installing dependencies and building TypeScript"
  cd "${SCRIPT_DIR}"
  if [[ ! -d node_modules ]]; then
    npm install
  fi
  npm run build
  if [[ ! -f "${SERVER_ENTRY}" ]]; then
    echo "Build did not produce ${SERVER_ENTRY}" >&2
    exit 1
  fi
}

register_claude_code() {
  echo "==> Registering with Claude Code (claude mcp add)"
  if ! command -v claude >/dev/null 2>&1; then
    echo "    claude CLI not on PATH — falling back to manual instructions"
    print_claude_manual
    return
  fi
  if claude mcp list 2>/dev/null | grep -q "^${SERVER_NAME}\b"; then
    echo "    ${SERVER_NAME} already registered; removing and re-adding"
    claude mcp remove "${SERVER_NAME}" >/dev/null 2>&1 || true
  fi
  claude mcp add "${SERVER_NAME}" -- node "${SERVER_ENTRY}"
  echo "    Registered. Verify with: claude mcp list"
}

print_claude_manual() {
  cat <<EOF
    Add this entry to ~/.claude.json under "mcpServers":

      "${SERVER_NAME}": {
        "command": "node",
        "args": ["${SERVER_ENTRY}"]
      }
EOF
}

register_codex() {
  echo "==> Registering with Codex (~/.codex/config.toml)"
  local cfg="${HOME}/.codex/config.toml"
  mkdir -p "${HOME}/.codex"
  if [[ -f "${cfg}" ]] && grep -q "^\[mcp_servers\.${SERVER_NAME}\]" "${cfg}"; then
    echo "    Codex config already has [mcp_servers.${SERVER_NAME}] — leaving in place. Edit manually if needed."
    return
  fi
  cat >> "${cfg}" <<EOF

[mcp_servers.${SERVER_NAME}]
command = "node"
args = ["${SERVER_ENTRY}"]
EOF
  echo "    Appended [mcp_servers.${SERVER_NAME}] to ${cfg}"
}

register_gemini() {
  echo "==> Gemini setup (manual)"
  cat <<EOF
    Add to ~/.gemini/settings.json under "mcpServers":

      "${SERVER_NAME}": {
        "command": "node",
        "args": ["${SERVER_ENTRY}"]
      }
EOF
}

register_cursor() {
  echo "==> Cursor setup (manual)"
  cat <<EOF
    Add to ~/.cursor/mcp.json under "mcpServers":

      "${SERVER_NAME}": {
        "command": "node",
        "args": ["${SERVER_ENTRY}"]
      }
EOF
}

print_default_summary() {
  cat <<EOF

==> Build complete. To wire the server into an MCP client, run one of:

    bash install.sh --for claude       # Claude Code (uses 'claude mcp add')
    bash install.sh --for codex        # Codex (~/.codex/config.toml)
    bash install.sh --for gemini       # Gemini (prints manual snippet)
    bash install.sh --for cursor       # Cursor (prints manual snippet)
    bash install.sh --for claude,codex # multiple at once

Reviewer prerequisites (per CLI you intend to use as a *reviewer*):
  - Install the matching CLI (codex / gemini / opencode / crush / kilo)
  - Run \`bash <repo>/install.sh --for <cli>\` so the review skills land in
    that CLI's config dir.
  - Sign into that CLI (ambient auth — this MCP server never sees secrets).

EOF
}

build_server

if [[ -z "${TARGETS}" ]]; then
  print_default_summary
  exit 0
fi

IFS=',' read -ra TARGET_LIST <<< "${TARGETS}"
for target in "${TARGET_LIST[@]}"; do
  case "${target}" in
    claude|claude-code) register_claude_code ;;
    codex) register_codex ;;
    gemini) register_gemini ;;
    cursor) register_cursor ;;
    *)
      echo "Unknown target: ${target} (supported: claude, codex, gemini, cursor)" >&2
      exit 2
      ;;
  esac
done

cat <<EOF

==> Done. Verify with:
    - Claude Code: \`claude mcp list\`
    - Codex: open a Codex session and ask it to list its MCP tools
    - Gemini / Cursor: restart the client to pick up the config change
EOF
