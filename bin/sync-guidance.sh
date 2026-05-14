#!/usr/bin/env bash
# bin/sync-guidance.sh — refresh the architectural-guidance docs that the
# adversarial-review MCP server injects into reviewer prompts.
#
# The guidance is proprietary content distributed via DevTeamSwarm — it is
# deliberately not committed to this (public) repository. `src/guidance/` is
# .gitignore'd; this script populates it at install time from whichever
# source is present on disk.
#
# Resolution order (first match wins):
#   1. $DEVTEAMSWARM_GUIDANCE_PATH               explicit override (CI etc.)
#   2. /Applications/DevTeamSwarm.app/Contents/Resources/guidance/
#   3. $HOME/Applications/DevTeamSwarm.app/Contents/Resources/guidance/
#   4. License-API fetch                         RESERVED — not implemented.
#      Slot for the future AWS Lambda + license-key flow; today the function
#      always returns "unresolved". When implemented, it will be inserted
#      here so it ranks below installed-app paths (offline beats network).
#   5. $HOME/Developer/DevTeamSwarm/DevTeamSwarmControl/guidance/
#      Maintainer-only dev fallback. Gated by DEVTEAMSWARM_USE_DEV_FALLBACK=1
#      so it can't accidentally fire on a contributor's machine.
#
# If none resolves, the script no-ops with an informational message and
# exits 0. The MCP server runs without architectural-intent injection —
# prompts that reference the guidance fall back to a brief stub.
#
# Modes:
#   bin/sync-guidance.sh             write changes, report what was synced
#   bin/sync-guidance.sh --check     exit 1 if anything is stale; no writes
#   bin/sync-guidance.sh --list      print pairs + sync state (always runs)
#   bin/sync-guidance.sh --where     print the resolved source path and exit
#   bin/sync-guidance.sh -h | --help help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${SERVER_ROOT}"

DST_GUIDANCE="${SERVER_ROOT}/src/guidance"

# ---- resolve canonical source -------------------------------------------

# Reserved slot for the future AWS Lambda + license-key distribution path.
# When implemented, this function will:
#   - read the license key from $DEVTEAMSWARM_LICENSE or ~/.config/devteamswarm/license
#   - POST it to the license API (Lambda Function URL) with Bearer auth
#   - on 200, download the presigned-URL tarball, verify sha256, extract to
#     a tmp dir, and print the tmp dir path on stdout (return 0)
#   - on missing license / network failure / 403 / sha mismatch, return 1
# Today it is a stub that always returns 1, so the resolver falls through to
# the dev-fallback path below. Filling this in is a separate ticket; the slot
# is reserved here so the resolution order stays visible in the code.
resolve_from_license_api() {
    return 1
}

resolve_source() {
    # 1. Explicit override — used by CI, tests, and "I know what I'm doing".
    if [ -n "${DEVTEAMSWARM_GUIDANCE_PATH:-}" ] && [ -d "${DEVTEAMSWARM_GUIDANCE_PATH}" ]; then
        printf '%s\n' "${DEVTEAMSWARM_GUIDANCE_PATH}"
        return 0
    fi

    # 2–3. Installed DevTeamSwarm.app — primary distribution channel.
    local app_paths=(
        "/Applications/DevTeamSwarm.app/Contents/Resources/guidance"
        "${HOME}/Applications/DevTeamSwarm.app/Contents/Resources/guidance"
    )
    local c
    for c in "${app_paths[@]}"; do
        if [ -d "$c" ]; then
            printf '%s\n' "$c"
            return 0
        fi
    done

    # 4. License-API fetch — reserved slot, currently a no-op.
    if path=$(resolve_from_license_api); then
        printf '%s\n' "$path"
        return 0
    fi

    # 5. Dev fallback — maintainer-only, gated to prevent accidental use.
    if [ "${DEVTEAMSWARM_USE_DEV_FALLBACK:-0}" = "1" ]; then
        local dev_path="${HOME}/Developer/DevTeamSwarm/DevTeamSwarmControl/guidance"
        if [ -d "${dev_path}" ]; then
            printf '%s\n' "${dev_path}"
            return 0
        fi
    fi

    return 1
}

# ---- pairs ---------------------------------------------------------------
# Relative to the resolved source on the left, and to ${DST_GUIDANCE} on the
# right. Adding new guidance files: append a row here.
PAIRS=(
    "ARCHITECTURE_GUIDELINES.md:ARCHITECTURE_GUIDELINES.md"
    "domains:domains"
    "patterns:patterns"
    "scale:scale"
)

usage() {
    cat <<EOF
Usage: bin/sync-guidance.sh [--check | --list | --where | -h]

  (default)   Sync canonical guidance into src/guidance/. Idempotent.
              No-op if no canonical source is present on disk.
  --check     Report drift, exit 1 if anything is stale. No writes.
              No-op (exit 0) if no canonical source is present.
  --list      Print pairs and current sync state. Always runs.
  --where     Print the resolved source path and exit. Exit 1 if unresolved.
  -h, --help  This message.

Resolution order (first match wins):
  1. \$DEVTEAMSWARM_GUIDANCE_PATH                       explicit override
  2. /Applications/DevTeamSwarm.app/Contents/Resources/guidance/
  3. \$HOME/Applications/DevTeamSwarm.app/Contents/Resources/guidance/
  4. License-API fetch                                  (reserved — not yet built)
  5. \$HOME/Developer/DevTeamSwarm/DevTeamSwarmControl/guidance/
                                  (maintainer-only; requires
                                   DEVTEAMSWARM_USE_DEV_FALLBACK=1)

If none of the above resolves, the MCP server runs with no architectural
guidance — prompts referencing it fall back to a brief stub.
EOF
}

mode="sync"
case "${1:-}" in
    --check) mode="check" ;;
    --list)  mode="list"  ;;
    --where) mode="where" ;;
    -h|--help) usage; exit 0 ;;
    "") ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
esac

# ---- where mode ---------------------------------------------------------
if [ "$mode" = "where" ]; then
    if SRC=$(resolve_source); then
        printf '%s\n' "${SRC}"
        exit 0
    fi
    cat >&2 <<EOF
sync-guidance.sh: no canonical guidance source found on disk.
  Looked for (in order):
    \$DEVTEAMSWARM_GUIDANCE_PATH                       (unset or missing)
    /Applications/DevTeamSwarm.app/Contents/Resources/guidance
    \$HOME/Applications/DevTeamSwarm.app/Contents/Resources/guidance
    license API                                       (reserved — not yet built)
    \$HOME/Developer/DevTeamSwarm/DevTeamSwarmControl/guidance
                                                      (gated by DEVTEAMSWARM_USE_DEV_FALLBACK=1)
EOF
    exit 1
fi

# ---- helpers ------------------------------------------------------------
src_missing_message() {
    local dev_state
    if [ "${DEVTEAMSWARM_USE_DEV_FALLBACK:-0}" = "1" ]; then
        dev_state="enabled but no directory at the expected path"
    else
        dev_state="disabled (set DEVTEAMSWARM_USE_DEV_FALLBACK=1 to enable)"
    fi
    cat <<EOF
sync-guidance.sh: no canonical guidance source found on disk — skipping.
  Looked for (in order):
    \$DEVTEAMSWARM_GUIDANCE_PATH                       (${DEVTEAMSWARM_GUIDANCE_PATH:-unset})
    /Applications/DevTeamSwarm.app/Contents/Resources/guidance
    \$HOME/Applications/DevTeamSwarm.app/Contents/Resources/guidance
    license API                                       (reserved — not yet built)
    \$HOME/Developer/DevTeamSwarm/DevTeamSwarmControl/guidance
                                                      (${dev_state})

The MCP server will run, but prompts that reference architectural guidance
will fall back to a brief stub. Install DevTeamSwarm.app to get the
architectural-intent injection. (Maintainer with a DevTeamSwarmControl
checkout: export DEVTEAMSWARM_USE_DEV_FALLBACK=1 and re-run.)
EOF
}

is_in_sync() {
    local src="$1" dst="$2"
    if [ -d "$src" ]; then
        [ -d "$dst" ] || return 1
        diff -rq "$src" "$dst" >/dev/null 2>&1
    elif [ -f "$src" ]; then
        [ -f "$dst" ] || return 1
        cmp -s "$src" "$dst"
    else
        return 2
    fi
}

drift_reason() {
    local src="$1" dst="$2"
    if [ -d "$src" ]; then
        [ -d "$dst" ] || { printf 'mirror missing'; return; }
        local diffs; diffs=$(diff -rq "$src" "$dst" 2>&1 | head -2 | sed 's/^/    /')
        printf 'content differs:\n%s' "$diffs"
    elif [ -f "$src" ]; then
        [ -f "$dst" ] || { printf 'mirror missing'; return; }
        printf 'content differs'
    else
        printf 'canonical missing'
    fi
}

sync_pair() {
    local src="$1" dst="$2"
    mkdir -p "$(dirname "$dst")"
    if [ -d "$src" ]; then
        rm -rf "$dst"
        cp -R "$src" "$dst"
    elif [ -f "$src" ]; then
        cp "$src" "$dst"
    else
        echo "sync-guidance.sh: canonical missing: $src" >&2
        return 1
    fi
}

# ---- list mode (always runs, even if source absent) ---------------------
if [ "$mode" = "list" ]; then
    if SRC=$(resolve_source); then
        echo "source: ${SRC}"
        echo
        printf '%-50s  %-50s  %s\n' "CANONICAL" "MIRROR" "STATE"
        for pair in "${PAIRS[@]}"; do
            rel_src="${pair%%:*}" rel_dst="${pair#*:}"
            src="${SRC}/${rel_src}" dst="${DST_GUIDANCE}/${rel_dst}"
            if [ ! -e "$src" ];     then state="(canonical missing)"
            elif is_in_sync "$src" "$dst"; then state="in sync"
            else                              state="STALE"
            fi
            printf '%-50s  %-50s  %s\n' "${rel_src}" "src/guidance/${rel_dst}" "$state"
        done
    else
        echo "source: (none resolved)"
        echo
        printf '%-50s  %-50s  %s\n' "CANONICAL" "MIRROR" "STATE"
        for pair in "${PAIRS[@]}"; do
            rel_src="${pair%%:*}" rel_dst="${pair#*:}"
            dst="${DST_GUIDANCE}/${rel_dst}"
            if [ -e "$dst" ]; then state="(vendored, source unresolved)"
            else                   state="(absent, source unresolved)"
            fi
            printf '%-50s  %-50s  %s\n' "${rel_src}" "src/guidance/${rel_dst}" "$state"
        done
    fi
    exit 0
fi

# ---- sync / check modes -------------------------------------------------
if ! SRC=$(resolve_source); then
    src_missing_message
    exit 0
fi

case "$mode" in
    check)
        stale=0
        for pair in "${PAIRS[@]}"; do
            rel_src="${pair%%:*}" rel_dst="${pair#*:}"
            src="${SRC}/${rel_src}" dst="${DST_GUIDANCE}/${rel_dst}"
            if ! is_in_sync "$src" "$dst"; then
                if [ "$stale" = 0 ]; then
                    echo "sync-guidance.sh: src/guidance/ is out of sync with ${SRC}." >&2
                    stale=1
                fi
                printf '  %s -> src/guidance/%s : %s\n' "$rel_src" "$rel_dst" "$(drift_reason "$src" "$dst")" >&2
            fi
        done
        if [ "$stale" = 1 ]; then
            echo >&2
            echo "Run \`bin/sync-guidance.sh\` to update the on-disk copy." >&2
            exit 1
        fi
        echo "sync-guidance.sh: src/guidance/ is in sync with ${SRC}."
        ;;

    sync)
        synced=0
        for pair in "${PAIRS[@]}"; do
            rel_src="${pair%%:*}" rel_dst="${pair#*:}"
            src="${SRC}/${rel_src}" dst="${DST_GUIDANCE}/${rel_dst}"
            if is_in_sync "$src" "$dst"; then continue; fi
            sync_pair "$src" "$dst"
            printf '  synced: %s -> src/guidance/%s\n' "$rel_src" "$rel_dst"
            synced=$((synced + 1))
        done
        if [ "$synced" = 0 ]; then
            echo "sync-guidance.sh: nothing to do — already in sync with ${SRC}."
        else
            echo "sync-guidance.sh: synced $synced item(s) from ${SRC}."
        fi
        ;;
esac
