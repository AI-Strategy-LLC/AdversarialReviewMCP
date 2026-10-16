# adversarial-review MCP server

An MCP server that dispatches review skills (`deep-review`, `branch-review`,
`bdd-audit`, `honesty-audit`, `counter-patterns`, `coverage-audit`) to a
**different AI CLI than the calling agent** — running on a different model,
with no exposure to the prior context.

This is the bridge that turns "external adversarial review for load-bearing
features" from an aspiration into a mechanically-enforceable habit. The
companion review skills it dispatches live in the
[AgentSkills](https://github.com/AI-Strategy-LLC/AgentSkills) repo; this
repo is the dispatcher.

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

| Reviewer | Binary | Authentication | Read-only sandbox | Ephemeral session | Model selection |
|---|---|---|---|---|---|
| codex | `codex` | `OPENAI_API_KEY` env or `codex login` | yes (`--sandbox read-only`) | yes (`--ephemeral`) | `--model` (OpenAI names) |
| antigravity | `agy` | interactive `agy` sign-in (OS keyring); verified via `agy models` | no | no | `--model` (`agy models` ids: Gemini, Claude, GPT-OSS) |
| opencode | `opencode` | `opencode auth login`, a provider in `opencode.json`, or the injected local provider | no | no | `--model provider/model[#variant]` |
| crush | `crush` | provider key in env, `~/.config/crush/crushrc`, or legacy `crush.json` | no | yes (`run` subcommand) | `-m` |
| kilo | `kilo` | `kilo auth` (OpenCode fork; auth.json / kilo.json probed best-effort) | no | no | `-m provider/model` |
| glm | `opencode` | Z.AI login via `opencode auth login` | no | no | `--model zai-coding-plan/…` |
| copilot | `copilot` | `copilot login` (keyring) or `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN` | no (`write` tool denied; shell can still write) | no | `--model` (Copilot catalog, or BYOK via `COPILOT_PROVIDER_*`) |
| claude | `claude` | `claude auth login` (keyring), `ANTHROPIC_API_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN` | no (Edit/Write denied; Bash can still write) | yes (`--no-session-persistence`) | `--model` (`fable`/`opus`/`sonnet`/`haiku` or full id) |

**Antigravity replaced Gemini CLI.** Google stopped serving Gemini CLI for
AI Pro/Ultra on 2026-06-18; the successor is the Antigravity CLI (`agy`).
Headless runs use `agy -p … --dangerously-skip-permissions`: without the
skip flag, print mode *soft-denies* any tool needing approval (exit 0, note
on stderr), which would silently hollow out a review. The adapter also
passes `--print-timeout 0` because agy's own default (5 minutes) is shorter
than a deep review. Default model is `gemini-4-argon-high` so that a Claude
Code host gets a different model family; override with
`ADVERSARIAL_REVIEW_ANTIGRAVITY_MODEL` or per call. Antigravity reads skills
from `<workspace>/.agents/skills/` and `~/.gemini/antigravity-cli/skills/`.

**`glm`** runs Z.ai's GLM models — a *model*, not a CLI, so it is hosted
inside the **OpenCode** harness. It behaves like the `opencode` reviewer but
always targets a GLM model.

- **Setup:** `opencode auth login` → choose **Z.AI** (or **Z.AI Coding Plan**
  if subscribed) → paste your key from the Z.AI console. Credentials land in
  `~/.local/share/opencode/auth.json`, which the adapter reads to verify auth.
- **Model:** defaults to `zai-coding-plan/glm-5.3` (subscription). Pay-as-you-go
  users export `ADVERSARIAL_REVIEW_GLM_MODEL=zai/glm-5.3`, or pass `model` per
  call. opencode requires the provider prefix (`zai-coding-plan/…` or `zai/…`);
  a bare `glm-5.3` will not route.

**`claude`** exists for hosts that are *not* Claude Code (Codex, Antigravity,
Copilot, …). `reviewer='auto'` never picks it when the `CLAUDECODE` env var
marks a Claude Code host; an explicit `reviewer='claude'` from a Claude host
is allowed but defeats the purpose of adversarial review.

Pi is intentionally not supported — Pi still has no built-in subagent tool
(only community extensions) and most review skills need one. Pi users should
run review skills directly in Pi rather than via this server.

## Choosing a model

Every reviewer accepts an optional `model`. Call **`list_models(reviewer)`**
first: it returns ids in the exact form the CLI's model flag takes, from
`opencode models`, `agy models`, or static aliases. Then pass one of them.

### OpenCode: cloud model or local model

OpenCode addresses models as `<provider>/<model>[#variant]`. Three ways to
get a routable provider:

1. **Logged-in cloud provider** — `opencode auth login` (Anthropic, Google,
   OpenAI, Z.AI, OpenCode Zen, …) or ambient AWS credentials for
   `amazon-bedrock/*` (e.g. `amazon-bedrock/us.anthropic.claude-opus-5-5`).
2. **Provider declared in `~/.config/opencode/opencode.json`** — the normal
   way to wire a self-hosted OpenAI-compatible server (`"npm":
   "@ai-sdk/openai-compatible"`, `options.baseURL`, a `models` map). Use its
   provider id as the prefix.
3. **Injected local provider** — set on the MCP server's environment:

   ```bash
   ADVERSARIAL_REVIEW_LOCAL_OPENAI_BASE_URL=http://aivas-a.local:4000/v1  # required; must serve /models and /chat/completions
   ADVERSARIAL_REVIEW_LOCAL_PROVIDER_ID=local                             # optional; prefix used in `model` (default "local")
   ADVERSARIAL_REVIEW_LOCAL_OPENAI_API_KEY=sk-…                           # optional; sent as Bearer, placeholder if unset
   ```

   Any `model` of the form `<provider-id>/<model-id>` (e.g.
   `local/qwen3.6-35b-nvfp4`, `local/openai/gpt-5.6-cyber` for a proxy that
   namespaces upstream models) makes the server inject an
   `@ai-sdk/openai-compatible` provider declaring exactly that model through
   `OPENCODE_CONFIG_CONTENT`, which OpenCode merges over its file config for
   that run only. Nothing is written to the user's `opencode.json`.
   `list_models(reviewer='opencode')` also queries `<base>/models` and lists
   the ids with the prefix applied. The `#variant` suffix (reasoning effort,
   e.g. `#max`) is stripped from the injected declaration and passed through
   to OpenCode.

Headless `opencode run` always gets `--auto` (approve permission asks that
are not explicitly denied — without it a review blocks or auto-rejects on the
first `external_directory` ask) and `--standalone` (a private server for the
run, so the review never shares state with an interactive session).

### Antigravity

`agy models` ids, e.g. `gemini-4-argon-high`, `gemini-3.8-flash-medium`,
`claude-sonnet-5-5-high`, `gpt-oss-120b-medium`. Pick a non-Claude id when
the host is Claude.

### Copilot

Copilot catalog names (`gpt-5.4`, `claude-sonnet-4.5`, …). To hit a local
OpenAI-compatible server instead, set `COPILOT_PROVIDER_BASE_URL`,
`COPILOT_PROVIDER_TYPE=openai`, `COPILOT_PROVIDER_API_KEY` and
`COPILOT_MODEL` on the MCP server's environment (Copilot's BYOK contract).

## Install

Prerequisites: Node ≥ 20, npm.

```bash
git clone https://github.com/AI-Strategy-LLC/AdversarialReviewMCP
cd AdversarialReviewMCP
bash install.sh                  # build only, print client-wiring snippets
bash install.sh --for claude     # build + register with Claude Code
bash install.sh --for codex      # build + register with Codex
bash install.sh --for antigravity # build + register with Antigravity CLI (agy mcp add)
bash install.sh --for claude,codex,antigravity,copilot,cursor
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
into whichever CLI you intend to use as a *reviewer*. The skills live in
the AgentSkills repo:

```bash
git clone https://github.com/AI-Strategy-LLC/AgentSkills
cd AgentSkills
bash install.sh --for codex        # so codex has /deep-review, /honesty-audit, …
bash install.sh --for antigravity  # ~/.gemini/antigravity-cli/skills/ (or .agents/skills/ in the repo)
bash install.sh --for copilot      # ~/.copilot/skills/ (or .agents/skills/ in the repo)
# etc
```

And sign each reviewer CLI in:

```bash
codex login        # or export OPENAI_API_KEY
agy                # sign in once interactively; verify with `agy models`
copilot login      # or export COPILOT_GITHUB_TOKEN / GH_TOKEN
crush              # configure a provider in ~/.config/crush/crushrc
opencode auth login
# kilo / claude: follow their docs
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

## Tool surface

### `list_reviewers()`

Returns one row per reviewer with `installed`, `version`, `authenticated`,
`supported_skills`, and a `notes` field describing safety-flag gaps (e.g.
"no read-only sandbox flag — reviewer runs with whatever permissions the CLI
grants").

### `list_models({ reviewer })`

Returns `{ reviewer, models[], note? }` — the model references that reviewer
can route right now, in the exact form its model flag accepts. Backed by
`opencode models` (opencode, glm — plus the injected local provider's
`/models` endpoint when configured), `agy models` (antigravity), or static
aliases (claude). Reviewers with no listing command (codex, copilot, crush,
kilo) return an empty list and a note.

### `adversarial_review({ skill, reviewer, repo_path, args?, model?, timeout_s?, ref?, isolation? })`

Generic dispatch. `skill` and `reviewer` are enums; `repo_path` is validated;
`args` and `model` are regex-validated; `timeout_s` defaults to 900;
`isolation` defaults to `"worktree"`.

Returns:

- `provider` — which CLI actually ran
- `model` — best-effort model identifier
- `isolation` — `"worktree"` or `"none"` (echo of input)
- `reviewed_ref` / `reviewed_sha` — what state the reviewer actually saw
- `worktree_path` — path of the temporary worktree (already removed by the time the response returns; useful for log forensics)
- `exit_code`
- `report_path` — absolute path to the report. With `write_artifacts: true`
  (default), the server writes the captured artifact to its canonical path
  inside `repo_path` and this is that path. With `write_artifacts: false`, this
  is empty — the caller is expected to write the file from `artifacts[].content`.
- `artifacts` — one entry per declared artifact for the skill (per the
  review-mode write contract — see Safety). Each entry has `id`,
  `canonical_path` (relative to `repo_path`), `format` (`markdown`|`json`|`text`),
  `content` (the captured body), `size_bytes`, `delimiter_found` (false if
  the reviewer ignored the contract — fall back to `summary`/`raw_stdout`),
  and `truncated` (true if the body exceeded the per-artifact 1 MB cap).
- `write_intent` — always `"caller_should_write"`. Marker that the caller is
  the contractually-responsible writer, even when `write_artifacts: true`
  pre-wrote the files as a convenience.
- `artifact_warnings` — non-fatal warnings (e.g. a `format: "json"` artifact
  that didn't parse).
- `summary` — last ~30 lines of stdout (the human-readable tail, *outside* the
  artifact delimiters)
- `raw_stdout` / `raw_stderr` — truncated to 16 KB
- `duration_s`
- `findings_count` — populated when the skill emits machine-readable
  findings (today: `honesty-audit`'s `findings` artifact)

### Per-skill convenience tools

`deep_review`, `branch_review`, `bdd_audit`, `honesty_audit`,
`counter_patterns`, `coverage_audit` — same parameters minus `skill`.

## Isolation — what the reviewer actually sees

The server defaults to **worktree isolation**: before spawning the reviewer it
runs `git worktree add --detach <tmpdir> <ref-or-HEAD>` against your repo and
points the reviewer at the worktree, not at your working directory. After the
reviewer finishes, the server copies any canonical-location report back into
your `repo_path` (so `docs/reviews/DEEP_REVIEW_2026-05-12.md` lands where you'd
expect) and removes the worktree.

Why this matters: without isolation, the reviewer sees your in-progress edits,
staged-but-uncommitted files, `node_modules/`, IDE temp files, `.env`
overrides, and anything else that's in your working tree but not in the
committed baseline. The reviewer's findings are then reviewing *your draft
state*, not the state you're going to ship.

Modes:

| `isolation` | What the reviewer sees | Notes |
|---|---|---|
| `worktree` (default) | A fresh checkout of `ref` (or HEAD) in a tmpdir, with no working-tree edits | Refuses to run if your `repo_path` has uncommitted changes (commit or stash first; you'd be reviewing a state that doesn't match your tree). Pass `ref` to review a specific branch / tag / sha. Reports are copied back into `repo_path`. |
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
   being returned. The artifact extractor (see §"Review-mode write contract"
   below) does string-match extraction only and never `eval`s or executes
   captured content.
5a. **Review-mode write contract.** The reviewer runs in a read-only sandbox
    (codex `--sandbox read-only` where supported) and is instructed by its
    prompt to emit each report artifact wrapped in skill-specific
    BEGIN/END delimiters on stdout — it MUST NOT attempt file writes. The
    server captures each delimited block, validates per-artifact format
    (`json` blocks are JSON-parsed), and returns them as `artifacts[]` in
    the response. By default (`write_artifacts: true`) the server also
    writes each artifact to its canonical path inside `repo_path` as a
    back-compat convenience — but the **contractual writer is the calling
    agent**, which is why every response carries `write_intent: "caller_should_write"`.
    The contract resolves a prior incoherence: prompts asked the reviewer
    to write files, while the sandbox forbade it; calling agents had been
    rescuing report content out of `raw_stdout` as a fragile undocumented
    fallback. That fallback now has a documented home — `delimiter_found:
    false` on an artifact signals the reviewer ignored the contract, in
    which case the caller falls back to `summary` / `raw_stdout`.
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
      _opencode.ts     # shared opencode plumbing: model refs, auth, local-provider injection
      codex.ts antigravity.ts opencode.ts glm.ts crush.ts kilo.ts copilot.ts claude.ts
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

## Environment variables

| Variable | Effect |
|---|---|
| `ADVERSARIAL_REVIEW_ALLOWLIST` | Colon-separated repo paths the server may review |
| `ADVERSARIAL_REVIEW_LOCAL_OPENAI_BASE_URL` | Base URL of a local OpenAI-compatible server; enables the injected provider for opencode |
| `ADVERSARIAL_REVIEW_LOCAL_PROVIDER_ID` | Prefix for local models in `model` (default `local`) |
| `ADVERSARIAL_REVIEW_LOCAL_OPENAI_API_KEY` | Bearer token for the local server (placeholder if unset) |
| `ADVERSARIAL_REVIEW_ANTIGRAVITY_MODEL` | Default `agy` model (default `gemini-4-argon-high`) |
| `ADVERSARIAL_REVIEW_GLM_MODEL` | Default GLM model (default `zai-coding-plan/glm-5.3`) |
| `CLAUDECODE` | Set by Claude Code in its children; makes `auto` skip the `claude` reviewer |

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
- **Adapter output parsing is heuristic.** Each CLI's stdout format is its
  own; the adapter scans for the skill's canonical report path
  (`docs/reviews/DEEP_REVIEW_YYYY-MM-DD.md`, etc.) and uses the tail of
  stdout as a summary. If the reviewer wrote a report under a different name,
  `report_path` will be empty even when a report exists — read the
  `raw_stdout` for the actual path.
- **`auto` selection is order-deterministic.** First installed +
  authenticated CLI in the order codex, antigravity, copilot, crush,
  opencode, kilo, glm, claude wins (claude is skipped on a Claude Code
  host). This is intentional (predictable) but doesn't load-balance.
- **Auth checks are only as honest as the CLI lets them be.** Antigravity,
  Copilot and Claude keep logins in the OS keyring. Antigravity is verified
  by running `agy models`; Copilot and Claude fall back to "assumed" unless
  an env token or credentials file is present (`verifiesAuth: false` in
  `list_reviewers` notes).
- **Kilo's auth/config paths are inferred** from its OpenCode lineage, not
  documented; a miss is reported as "assumed", never "unauthenticated".
