# adversarial-review MCP server

An MCP server that dispatches review skills (`deep-review`, `branch-review`,
`bdd-audit`, `honesty-audit`, `counter-patterns`, `coverage-audit`) to a
**different AI CLI than the calling agent** — running on a different model,
with no exposure to the prior context.

This is the bridge that turns "external adversarial review for load-bearing
features" from an aspiration into a mechanically-enforceable habit. The
companion review skills it dispatches live in the
[CVP Skills Library](https://github.com/cvp-accelerators/cvp-skills-library)
(`skills/dev/global-scope/`); this server is the dispatcher.

## Why this exists

Self-review by the same model that produced the work catches roughly 80% of
failure modes. The remaining 20% — the "shipped fraud" category, where a
feature looks complete on self-review but is hollow inside — is consistently
caught only by an external model with no exposure to the prior context. This
server is the production mechanism for that pattern.

The calling Claude session asks for `adversarial_review(skill=…, reviewer=…)`.
The server spawns the reviewer CLI as a subprocess, points it at the repo, and
asks it to run the named review skill. The reviewer emits its report (and any
other artifacts) on stdout wrapped in delimiters; the server captures them and,
by default, writes each to its canonical path under `repo_path` and returns the
report path on disk (pass `write_artifacts: false` to receive the artifact
bodies in the result instead and write them yourself). The calling session can
then read that report directly.

## Supported reviewers

| CLI | Binary | Authentication | Read-only sandbox | Ephemeral session |
|---|---|---|---|---|
| codex | `codex` | `OPENAI_API_KEY` env or `codex login` | yes (`--sandbox read-only`) | yes (no rollout persist) |
| gemini | `gemini` | `GEMINI_API_KEY` / `GOOGLE_API_KEY` env or OAuth | no | yes (`--yolo` non-interactive) |
| opencode | `opencode` | per-provider config | no | no |
| crush | `crush` | provider key in env or `~/.config/crush/crush.json` | no | yes (`run` subcommand) |
| kilo | `kilo` | per-config | no | no |

Pi is intentionally not supported — Pi has no Agent tool and most review
skills are thin stubs that need one. Pi users should run review skills
directly in Pi rather than via this server.

## Install

Prerequisites: Node ≥ 20, npm.

```bash
git clone https://github.com/cvp-accelerators/cvp-skills-library.git
cd cvp-skills-library/mcp-servers/adversarial-review
bash install.sh                  # build only, print client-wiring snippets
bash install.sh --for claude     # build + register with Claude Code
bash install.sh --for codex      # build + register with Codex
bash install.sh --for claude,codex,gemini,cursor
```

### Self-contained local deploy

`install.sh` registers the MCP client against `dist/server.js` *in this
checkout* — so the server depends on the checkout staying put, built, and
with `node_modules/` intact. To cut that dependency:

```bash
npm install            # one-time: pulls in esbuild
npm run deploy:local   # bundle + stage under ~/.local/share
```

`deploy:local` (see `bin/deploy-local.sh`) produces a single-file esbuild
bundle — server + MCP SDK + zod, ~750 KB, no `node_modules/` — plus the
`prompts/` and `guidance/` asset trees, under
`${XDG_DATA_HOME:-~/.local/share}/adversarial-review-mcp/` (override with
`$ADVERSARIAL_REVIEW_DEPLOY_DIR`). It smoke-tests the bundle before
declaring success, then prints the one-time `claude mcp add` line. Point
your MCP client at the bundled `server.mjs`; later redeploys reuse the same
path, so no re-registration is needed.

After installing this server, you also need to install the **review skills**
into whichever CLI you intend to use as a *reviewer*. Install the CVP Skills
Library for the reviewer CLIs:

```bash
# Install the skills library for your reviewer CLIs
bash install.sh --for codex      # so codex has /deep-review, /honesty-audit, …
bash install.sh --for gemini
# etc
```

And sign each reviewer CLI in:

```bash
codex login        # or export OPENAI_API_KEY
gemini auth login  # or export GEMINI_API_KEY
crush              # configure provider in ~/.config/crush/crush.json
# opencode / kilo: follow their docs
```

## Architectural-intent injection

The reviewer prompts for `deep-review`, `counter-patterns`, `bdd-audit`,
`coverage-audit`, and `branch-review` include an "Architectural intent"
section that biases the review toward a specific set of architectural
principles instead of generic "is this shippable" hygiene. Concretely the
reviewer is told to treat the principles as the standard the code should
meet, and to flag every deviation as a candidate finding with a citation
to the principle being violated.

### Where the guidance comes from

The subset the server injects (`ARCHITECTURE_GUIDELINES.md` + `domains/` +
`patterns/` + `scale/`) is **vendored (committed)** under `src/guidance/`, so
the repo is self-contained and portable — no DevTeamSwarm.app install or
DevTeamSwarmControl checkout is required at runtime. (Unconsumed
DevTeamSwarmControl files such as `HONESTY.md` stay `.gitignore`d and are not
published here.)

`bin/sync-guidance.sh` **refreshes** the vendored copy from a canonical
source when one is present, resolving it in this order (first match wins):

1. `$DEVTEAMSWARM_GUIDANCE_PATH` — explicit override (CI, tests, "I know
   what I'm doing").
2. `/Applications/DevTeamSwarm.app/Contents/Resources/guidance/` — system
   install on macOS.
3. `$HOME/Applications/DevTeamSwarm.app/Contents/Resources/guidance/` —
   user install on macOS.
4. **License-API fetch** — RESERVED. Future AWS Lambda + license-key flow
   for headless / CI / non-Mac users without the .app. Not implemented
   today (the stub always returns "unresolved" and the resolver falls
   through).
5. `$HOME/Developer/DevTeamSwarm/DevTeamSwarmControl/guidance/` —
   **maintainer-only** dev fallback. Gated behind
   `DEVTEAMSWARM_USE_DEV_FALLBACK=1` so it cannot accidentally fire on a
   contributor's machine that happens to have a coincidentally-named
   directory.

`bash install.sh --for <cli>` runs the sync automatically. If none of those
paths resolves, the sync is a no-op and the **committed** copy under
`src/guidance/` is used as-is — so architectural-intent injection works out of
the box on a fresh clone.

Useful sub-commands:

```bash
bash bin/sync-guidance.sh              # refresh src/guidance/ from the resolved source
bash bin/sync-guidance.sh --check      # CI / pre-commit drift check
bash bin/sync-guidance.sh --list       # show pairs + state
bash bin/sync-guidance.sh --where      # print the resolved source path
```

### Shipping guidance inside DevTeamSwarm.app

The primary distribution channel is the .app bundle. To wire it up, the
Xcode project for DevTeamSwarm.app must include a Run Script Build Phase
that copies the canonical `DevTeamSwarmControl/guidance/` tree into
`Contents/Resources/guidance/` of the built `.app`. Example phase:

```bash
set -euo pipefail
SRC="${SRCROOT}/../DevTeamSwarmControl/guidance"
DST="${BUILT_PRODUCTS_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/guidance"
if [ -d "${SRC}" ]; then
  mkdir -p "${DST}"
  rsync -a --delete "${SRC}/" "${DST}/"
else
  echo "warning: ${SRC} not found — built .app will ship without guidance"
fi
```

Once the .app is installed (TestFlight, Mac App Store, direct download —
whichever distribution channel gates your audience), the MCP server's
sync script picks the guidance up automatically.

### Per-repo opt-in: domain / pattern / scale

`ARCHITECTURE_GUIDELINES.md` is the universal layer — always injected when
present. For repo-specific bias, commit a `.adversarial-review/architecture.json`
at the root of the **repo being reviewed** with any combination of
`domain`, `pattern`, and `scale`:

```json
{
  "domain": "cli-tool",
  "pattern": "hexagonal",
  "scale": "small-team"
}
```

The values must match the basenames of files under
`src/guidance/domains/`, `src/guidance/patterns/`, and `src/guidance/scale/`
(e.g. `domains/cli-tool.md`, `patterns/hexagonal.md`, `scale/small-team.md`).
The corresponding files are inlined into prompts via a
`{{REPO_ARCHITECTURE_CONTEXT}}` slot. Each key is independent — omit any
that don't apply. Misspellings surface as a warning on stderr and the
review proceeds without that slice.

This is a declaration of *intent* by the repo author: the reviewer is
explicitly told to flag code that disagrees with the declared
domain/pattern/scale. Mismatches between asserted intent and observed
code are some of the highest-signal findings adversarial review produces.

## Allowlist (repo-path whitelist)

By default the server will accept any absolute existing directory as
`repo_path`. To restrict it, set either:

- `ADVERSARIAL_REVIEW_ALLOWLIST=/abs/path1:/abs/path2` env var, OR
- A file at `~/.config/agent-skills/adversarial-review/allowlist.txt` with one
  absolute path per line (`#` comments allowed).

`repo_path` must be one of the listed paths or a subdirectory of one.

Independently of the allowlist, a **hardcoded denylist** always refuses known
credential stores — `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.kube`, `~/.docker`,
`~/.azure`, `~/.config/gcloud`, `/etc`, `/root` (and their subtrees) — plus the
home directory and filesystem root themselves. This applies even with no
allowlist configured, and even an explicit allowlist entry cannot override it,
so a zero-config server never points a reviewer at a secret store.

## Tool surface

### `list_reviewers()`

Returns one row per reviewer with `installed`, `version`, `authenticated`,
`supported_skills`, and a `notes` field describing safety-flag gaps (e.g.
"no read-only sandbox flag — reviewer runs with whatever permissions the CLI
grants").

### `adversarial_review({ skill, reviewer, repo_path, args?, model?, timeout_s?, ref?, isolation?, write_artifacts? })`

Generic dispatch. `skill` and `reviewer` are enums; `repo_path` is validated;
`args` and `model` are regex-validated; `timeout_s` defaults to 900;
`isolation` defaults to `"worktree"`; `write_artifacts` defaults to `true`
(server writes captured artifacts to their canonical paths under `repo_path`;
set `false` to receive their bodies in the result instead).

Returns:

- `provider` — which CLI actually ran
- `model` — best-effort model identifier
- `isolation` — `"worktree"` or `"none"` (echo of input)
- `reviewed_ref` / `reviewed_sha` — what state the reviewer actually saw
- `worktree_path` — path of the temporary worktree (already removed by the time the response returns; useful for log forensics)
- `exit_code`
- `report_path` — absolute path to the primary report, under your `repo_path`, when the server wrote it (`write_artifacts: true`); falls back to a report the reviewer wrote to disk directly
- `artifacts` — one entry per declared artifact the reviewer emitted: `id`, `canonical_path`, `format`, `delimiter_found`, `size_bytes`, `truncated`, `written` (+ `written_path`), `content` (only when not written), and an optional `format_warning` (e.g. a `findings.json` that didn't parse)
- `summary` — last ~30 lines of stdout
- `raw_stdout` / `raw_stderr` — truncated to 16 KB
- `duration_s`
- `findings_count` — populated when the skill emits machine-readable
  findings (today: `honesty-audit`'s `findings.json`)

### Per-skill convenience tools

`deep_review`, `branch_review`, `bdd_audit`, `honesty_audit`,
`counter_patterns`, `coverage_audit` — same parameters minus `skill`.

## Isolation — what the reviewer actually sees

The server defaults to **worktree isolation**: before spawning the reviewer it
runs `git worktree add --detach <tmpdir> <ref-or-HEAD>` against your repo and
points the reviewer at the worktree, not at your working directory. The
reviewer emits its artifacts on stdout; the server writes them into your
`repo_path` at their canonical paths (so `docs/reviews/DEEP_REVIEW_2026-05-12.md`
lands where you'd expect) — and, as a fallback, copies back any report a
reviewer wrote to disk in the worktree instead. Then it removes the worktree.

Why this matters: without isolation, the reviewer sees your in-progress edits,
staged-but-uncommitted files, `node_modules/`, IDE temp files, `.env`
overrides, and anything else that's in your working tree but not in the
committed baseline. The reviewer's findings are then reviewing *your draft
state*, not the state you're going to ship.

Modes:

| `isolation` | What the reviewer sees | Notes |
|---|---|---|
| `worktree` (default) | A fresh checkout of `ref` (or HEAD) in a tmpdir, with no working-tree edits | Refuses to run if your `repo_path` has uncommitted changes (commit or stash first; you'd be reviewing a state that doesn't match your tree). Pass `ref` to review a specific branch / tag / sha. Emitted artifacts are written into `repo_path` (a report a reviewer writes to disk in the worktree is copied back as a fallback). |
| `none` | `repo_path` directly, including your uncommitted edits | Useful when you explicitly want a review of work-in-progress. `ref` is not allowed in this mode. |

Worktree isolation does **not** sandbox the reviewer at the kernel level —
the reviewer process still runs as your user with access to `~/.aws/`,
`~/.ssh/`, etc. If you need true filesystem isolation (untrusted reviewer
binary, multi-tenant CI, regulated env), run the reviewer in a container
yourself and skip this server's worktree mode.

## Safety / threat surface

This server crosses a trust boundary: it spawns external models with read
access to the user's repo. The mitigations baked in:

1. **Read-only by default.** Where the reviewer CLI has a strongest
   read-only flag (codex `--sandbox read-only`), the adapter passes it.
   Where it doesn't, `list_reviewers().notes` says so.
2. **Ephemeral session where available.** Reduces blast radius of a
   compromised reviewer storing context for later.
3. **Repo-path allowlist.** Refuses paths outside it.
4. **Prompt-injection floor.** Prompts are built from fixed templates in
   `src/prompts/*.txt`. Caller-controlled fields are inserted only through
   allowlisted slots. `skill` is an enum; `args` is regex-validated
   (`[A-Za-z0-9 _\-./=,:]*`, max 512 chars); `model` is regex-validated
   (`[A-Za-z0-9_\-./:@]+`, max 128 chars).
5. **Stdout treated as untrusted.** `raw_stdout` is plain text; any
   "instructions" inside it have no executable effect. `report_path` is
   resolved and verified to be inside `repo_path` (no `../` escape) before
   being returned.
6. **Ambient auth, best-effort verification.** The server never reads or
   stores credentials. `codex`, `gemini`, and `crush` verify a credential
   (env var / login session / config file) and the run is refused if none is
   found. `opencode` and `kilo` have no headless auth probe, so they
   optimistically report `authenticated: true` when the binary is present and a
   real auth failure only surfaces at run time — `list_reviewers` flags this in
   their `notes` ("auth not verified").

What is **NOT** mitigated by this server (call out in your own threat model
if relevant):

- Reviewer CLIs that don't support read-only sandboxing can read or write any
  file the host user has access to during the run. The repo allowlist and the
  credential-store denylist constrain what *path* the server points the reviewer
  at (and the denylist hard-refuses secret stores), but neither constrains where
  an unsandboxed reviewer — or its own MCP servers — wanders once it's running.
- The reviewer's model may itself be compromised, jailbroken, or producing
  hallucinated findings. The point of adversarial review is to surface gaps
  the original model missed; it is **not** to give the reviewer infallibility.

## Verification

```bash
# Type check
npm run typecheck

# Tests (unit)
npm test

# End-to-end against this repo (requires at least one reviewer installed + authed)
# In a Claude Code session with the server registered:
#   call list_reviewers
#   call adversarial_review with skill="honesty-audit", reviewer="codex",
#        repo_path="/Users/you/Developer/AgentSkills"
# then read the report at docs/honesty-audit/REPORT.md
```

## Layout

```
mcp-servers/adversarial-review/
  package.json, tsconfig.json, install.sh
  bin/
    sync-guidance.sh   # populate src/guidance/ from the canonical source
  src/
    server.ts          # MCP entrypoint, registers all tools
    runner.ts          # core dispatch — validate, spawn, parse, return
    guidance.ts        # loader for vendored guidance + per-repo arch config
    types.ts           # shared TypeScript types
    safety.ts          # repo allowlist + args/model validators + containment
    adapters/
      _helpers.ts      # shared probe + parse helpers
      codex.ts gemini.ts opencode.ts crush.ts kilo.ts
      index.ts         # ADAPTERS registry
    prompts/
      deep-review.txt branch-review.txt bdd-audit.txt
      honesty-audit.txt counter-patterns.txt coverage-audit.txt
    guidance/          # vendored subset committed; unconsumed files .gitignore'd
      ARCHITECTURE_GUIDELINES.md  # universal architecture principles
      domains/<domain>.md         # api-service, cli-tool, …
      patterns/<pattern>.md       # hexagonal, monolith, …
      scale/<scale>.md            # personal, small-team, …
  test/adapters/*.test.ts
```

## Known limitations

- **No kernel-level reviewer sandbox.** Worktree isolation prevents the
  reviewer from seeing your uncommitted edits but does not stop the reviewer
  process from reading other files your user can read. If that matters, run
  the reviewer in a container yourself and use `isolation='none'` pointed at
  the container's checkout.
- **No MCP-server isolation in reviewers.** None of the supported CLIs has a
  clean "disable all my MCP servers for this run" flag today. If you trust
  the reviewer's MCP servers, this is fine. If you don't, configure the
  reviewer to run without them.
- **Artifact capture is delimiter-based; the file-path fallback is heuristic.**
  The reviewer emits each artifact between exact `<<<ARTIFACT:…>>>` markers,
  which the server extracts deterministically. Only when a reviewer ignores the
  contract and writes a file directly does the adapter fall back to scanning
  stdout for the skill's canonical report path
  (`docs/reviews/DEEP_REVIEW_YYYY-MM-DD.md`, etc.); if that file used a different
  name, `report_path` will be empty even when a report exists — read the
  `raw_stdout` for the actual path.
- **`auto` selection is order-deterministic.** First installed +
  authenticated CLI in the order codex, gemini, crush, opencode, kilo wins.
  This is intentional (predictable) but doesn't load-balance.
