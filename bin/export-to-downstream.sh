#!/usr/bin/env bash
#
# export-to-downstream.sh — vendor this MCP server into a downstream monorepo.
#
# Pushes a curated subset of THIS repo (the canonical AdversarialReviewMCP
# source, your IP) into a downstream checkout's mcp-servers/adversarial-review/
# directory, leaving every change UNCOMMITTED for your review. Run by the
# maintainer; the downstream (customer) repo never needs access to this one and
# gains no pointer back to it.
#
# Usage:
#   bin/export-to-downstream.sh --to /path/to/cvp-skills-library
#   bin/export-to-downstream.sh --to /path/to/repo --dry-run
#   bin/export-to-downstream.sh --dest /path/to/repo/mcp-servers/adversarial-review
#   DOWNSTREAM_ROOT=/path/to/repo bin/export-to-downstream.sh
#
# Options:
#   --to <dir>        Downstream repo root; export lands in <dir>/<subpath>.
#   --subpath <p>     Subpath inside the downstream repo (default below).
#   --dest <dir>      Full destination dir (overrides --to/--subpath).
#   --dry-run | -n    Show what would change; write nothing.
#   --allow-dirty     Allow exporting from a dirty upstream working tree.
#
# Mirrors (authoritative — deletions propagate): src/ test/ bin/  and the build
#   config files package.json package-lock.json tsconfig.json vitest.config.ts
#   install.sh .gitignore
# Never touches (kept on the IP side, or repo/customer-specific — sync by hand if
#   ever needed): .git node_modules dist .github .claude README.md LICENSE docs/
#   and this script itself.
#
set -euo pipefail

SUBPATH="mcp-servers/adversarial-review"
DOWNSTREAM_ROOT="${DOWNSTREAM_ROOT:-}"
DEST_OVERRIDE=""
ALLOW_DIRTY=0
DRYRUN=0

usage() {
  grep -E '^#( |$)' "${BASH_SOURCE[0]}" | sed -E 's/^# ?//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --to)          DOWNSTREAM_ROOT="${2:?--to needs a path}"; shift 2;;
    --subpath)     SUBPATH="${2:?--subpath needs a value}"; shift 2;;
    --dest)        DEST_OVERRIDE="${2:?--dest needs a path}"; shift 2;;
    --allow-dirty) ALLOW_DIRTY=1; shift;;
    --dry-run|-n)  DRYRUN=1; shift;;
    -h|--help)     usage 0;;
    *) echo "unknown arg: $1" >&2; usage 1;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "$SCRIPT_DIR/.." && pwd)"
THIS_SCRIPT="$(basename "${BASH_SOURCE[0]}")"

if [ -n "$DEST_OVERRIDE" ]; then
  DEST="$DEST_OVERRIDE"
elif [ -n "$DOWNSTREAM_ROOT" ]; then
  DEST="$DOWNSTREAM_ROOT/$SUBPATH"
else
  echo "error: pass --to <downstream-repo-root> (or set DOWNSTREAM_ROOT, or --dest <full path>)" >&2
  usage 1
fi

command -v rsync >/dev/null || { echo "error: rsync not on PATH" >&2; exit 1; }
[ -d "$DEST" ] || { echo "error: destination dir does not exist: $DEST" >&2; exit 1; }

SRC_SHA="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo '(no git)')"
if [ "$ALLOW_DIRTY" -eq 0 ] && git -C "$SRC" rev-parse --git-dir >/dev/null 2>&1 \
   && [ -n "$(git -C "$SRC" status --porcelain)" ]; then
  echo "WARNING: upstream working tree is dirty — refusing to export uncommitted IP." >&2
  echo "         Commit first for a traceable export, or pass --allow-dirty." >&2
  exit 1
fi

echo "Exporting AdversarialReviewMCP @ ${SRC_SHA}$([ "$DRYRUN" -eq 1 ] && echo '  [DRY RUN]')"
echo "  from: $SRC"
echo "  to:   $DEST"
echo

RSYNC_OPTS=(-a --delete)
[ "$DRYRUN" -eq 1 ] && RSYNC_OPTS+=(-n -v)

sync_dir() {  # $1 = relative dir; remaining args = extra rsync flags
  local d="$1"; shift
  [ -d "$SRC/$d" ] || { echo "  (skip missing dir $d/)"; return; }
  rsync "${RSYNC_OPTS[@]}" "$@" "$SRC/$d/" "$DEST/$d/"
}

copy_file() {  # $1 = relative file
  local f="$1"
  if [ ! -f "$SRC/$f" ]; then echo "  (skip missing $f)"; return; fi
  if [ "$DRYRUN" -eq 1 ]; then echo "  would copy $f"; else cp "$SRC/$f" "$DEST/$f"; fi
}

sync_dir src
sync_dir test
sync_dir bin --exclude="$THIS_SCRIPT"

for f in package.json package-lock.json tsconfig.json vitest.config.ts install.sh .gitignore; do
  copy_file "$f"
done

echo
if [ "$DRYRUN" -eq 1 ]; then
  echo "Dry run only — nothing written. Re-run without --dry-run to apply."
else
  cat <<EOF
Done. README.md / LICENSE / docs/ / .github/ were intentionally left untouched.
Review before committing in the downstream repo:
  git -C "$DEST" status -s && git -C "$DEST" diff
  ( cd "$DEST" && npm ci && npm run typecheck && npm test && npm run build )

This script does NOT commit or push — the export is staged for your review.
EOF
fi
