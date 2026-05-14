# src/guidance/ — architectural-intent injection (proprietary content)

The adversarial-review MCP server biases its reviewer prompts toward the
user's intended architectural patterns rather than generic "is this
shippable" hygiene. To do that, the server injects three classes of content
into prompts at render time:

- `ARCHITECTURE_GUIDELINES.md` — universal architectural principles (always
  injected into prompts that opt in).
- `domains/<domain>.md` — what to expect for a given application shape
  (api-service, cli-tool, data-pipeline, desktop-app, devops-infra, library,
  mobile-app, web-app).
- `patterns/<pattern>.md` — what to expect for a given decomposition pattern
  (clean-architecture, cqrs, event-driven, hexagonal, layered, microservices,
  monolith, mvc, mvvm, pipe-and-filter, repository-pattern, serverless).
- `scale/<scale>.md` — what to expect for a given team scale (personal,
  small-team, medium-team, large-enterprise).

The reviewed repo opts in to the per-repo slices by committing a
`.adversarial-review/architecture.json` with optional `domain`, `pattern`,
and `scale` keys (see the MCP server's top-level README for the schema).

## Why this directory is empty in git

The guidance files are **proprietary content distributed via DevTeamSwarm**.
They are deliberately not committed to this public repository. Everything
in `src/guidance/` except this README and the `.keep` sentinel is
`.gitignore`d.

## How the directory gets populated

`bin/sync-guidance.sh` resolves the canonical source in this order (first
match wins):

1. `$DEVTEAMSWARM_GUIDANCE_PATH` — explicit override (CI, tests).
2. `/Applications/DevTeamSwarm.app/Contents/Resources/guidance/` — primary
   distribution channel (macOS system install).
3. `$HOME/Applications/DevTeamSwarm.app/Contents/Resources/guidance/` —
   macOS user install.
4. License-API fetch — **reserved**. Future AWS Lambda + license-key flow.
   The stub always returns "unresolved" today.
5. `$HOME/Developer/DevTeamSwarm/DevTeamSwarmControl/guidance/` —
   **maintainer-only** dev fallback. Gated behind
   `DEVTEAMSWARM_USE_DEV_FALLBACK=1` so it cannot accidentally fire on a
   contributor's machine.

If none resolves, the sync script no-ops with an informational message and
leaves the directory empty. The MCP server still runs — prompts that
reference the guidance fall back to a brief stub explaining what's missing.

## Updating the vendored copy

```bash
# Pull the latest from whichever source is present:
bash bin/sync-guidance.sh

# Check whether the on-disk copy is stale (CI / pre-commit guard):
bash bin/sync-guidance.sh --check

# Show pairs + state:
bash bin/sync-guidance.sh --list
```

The build step (`npm run build`) does not run sync — it copies whatever is
currently in `src/guidance/` into `dist/guidance/`. Run sync explicitly when
you want fresh content.
