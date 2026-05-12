# adversarial-review MCP server

An MCP server that dispatches review skills (`deep-review`, `branch-review`,
`bdd-audit`, `honesty-audit`, `counter-patterns`, `coverage-audit`) to a
**different AI CLI than the calling agent** — running on a different model,
with no exposure to the prior context.

This is the bridge that makes the "external adversarial review for
load-bearing features" rule in `CLAUDE.md` mechanically enforceable instead
of an aspiration.

## Why this exists

Self-review by the same model that produced the work catches roughly 80% of
failure modes. The remaining 20% — the "shipped fraud" category, where a
feature looks complete on self-review but is hollow inside — is consistently
caught only by an external model with no exposure to the prior context. This
server is the production mechanism for that pattern.

The calling Claude session asks for `adversarial_review(skill=…, reviewer=…)`.
The server spawns the reviewer CLI as a subprocess, points it at the repo,
asks it to run the named review skill, and returns a structured result with
the report path on disk. The calling session can then read that report
directly.

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
bash install.sh                  # build only, print client-wiring snippets
bash install.sh --for claude     # build + register with Claude Code
bash install.sh --for codex      # build + register with Codex
bash install.sh --for claude,codex,gemini,cursor
```

After installing, you also need to install the review skills into whichever
CLI you intend to use as a *reviewer*. From the root of this repo:

```bash
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

## Allowlist (repo-path whitelist)

By default the server will accept any absolute existing directory as
`repo_path`. To restrict it, set either:

- `ADVERSARIAL_REVIEW_ALLOWLIST=/abs/path1:/abs/path2` env var, OR
- A file at `~/.config/agent-skills/adversarial-review/allowlist.txt` with one
  absolute path per line (`#` comments allowed).

`repo_path` must be one of the listed paths or a subdirectory of one.

## Tool surface

### `list_reviewers()`

Returns one row per reviewer with `installed`, `version`, `authenticated`,
`supported_skills`, and a `notes` field describing safety-flag gaps (e.g.
"no read-only sandbox flag — reviewer runs with whatever permissions the CLI
grants").

### `adversarial_review({ skill, reviewer, repo_path, args?, model?, timeout_s? })`

Generic dispatch. `skill` and `reviewer` are enums; `repo_path` is validated;
`args` and `model` are regex-validated; `timeout_s` defaults to 900.

Returns:

- `provider` — which CLI actually ran
- `model` — best-effort model identifier
- `exit_code`
- `report_path` — absolute path to the report the skill wrote, if found at
  the skill's canonical location (e.g. `docs/reviews/DEEP_REVIEW_2026-05-12.md`)
- `summary` — last ~30 lines of stdout
- `raw_stdout` / `raw_stderr` — truncated to 16 KB
- `duration_s`
- `findings_count` — populated when the skill writes machine-readable
  findings (today: `honesty-audit`'s `findings.json`)

### Per-skill convenience tools

`deep_review`, `branch_review`, `bdd_audit`, `honesty_audit`,
`counter_patterns`, `coverage_audit` — same parameters minus `skill`.

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
6. **Ambient auth only.** The server never reads or stores credentials. If
   `OPENAI_API_KEY` etc. aren't in env, the auth check fails and the run is
   refused with an instruction.

What is **NOT** mitigated by this server (call out in your own threat model
if relevant):

- Reviewer CLIs that don't support read-only sandboxing can read or write any
  file the host user has access to during the run. The repo allowlist
  constrains what *path* the server points the reviewer at, but does not
  constrain what the reviewer's own MCP servers might do once it's running.
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
mcp/adversarial-review/
  package.json, tsconfig.json, install.sh
  src/
    server.ts          # MCP entrypoint, registers all tools
    runner.ts          # core dispatch — validate, spawn, parse, return
    types.ts           # shared TypeScript types
    safety.ts          # repo allowlist + args/model validators + containment
    adapters/
      _helpers.ts      # shared probe + parse helpers
      codex.ts gemini.ts opencode.ts crush.ts kilo.ts
      index.ts         # ADAPTERS registry
    prompts/
      deep-review.txt branch-review.txt bdd-audit.txt
      honesty-audit.txt counter-patterns.txt coverage-audit.txt
  test/adapters/*.test.ts
```

## Known limitations

- **No MCP-server isolation in reviewers.** None of the supported CLIs has a
  clean "disable all my MCP servers for this run" flag today. If you trust
  the reviewer's MCP servers, this is fine. If you don't, configure the
  reviewer to run without them.
- **Adapter output parsing is heuristic.** Each CLI's stdout format is its
  own; the adapter scans for the skill's canonical report path
  (`docs/reviews/DEEP_REVIEW_YYYY-MM-DD.md`, etc.) and uses the tail of
  stdout as a summary. If the reviewer wrote a report under a different name,
  `report_path` will be empty even when a report exists — read the
  `raw_stdout` for the actual path.
- **`auto` selection is order-deterministic.** First installed +
  authenticated CLI in the order codex, gemini, crush, opencode, kilo wins.
  This is intentional (predictable) but doesn't load-balance.
