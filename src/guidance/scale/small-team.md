+++
display_name = "Small Team (2-5)"
applies_to = ["small-team", "startup", "indie", "small-org", "2-5-developers"]
+++

# Small Team (2-5) Scale Guidance

## Characteristics

Small teams of 2-5 developers can maintain high bandwidth communication and shared
context. Everyone knows the full codebase. Decisions are made quickly through
conversation. The risk is not lack of process but too much process -- overhead that
slows a small team provides less value than it costs. Keep processes lightweight and
trust-based.

Defining traits:
- Every developer can understand the full system architecture.
- Communication happens directly (chat, quick calls). Formal meetings should be rare.
- Shared code ownership: anyone can modify any file, but areas of expertise emerge naturally.
- The team lead (if one exists) is a working contributor, not a full-time manager.
- Deploy frequently (at least weekly, ideally daily). Small increments reduce risk and speed feedback.

## Key Conventions

- **PR-based workflow**: Every change goes through a pull request. One approval is sufficient. Reviews should happen within hours, not days. If someone is blocked waiting for review, that is a process failure.
- **Trunk-based development or short-lived branches**: Feature branches should live less than 2 days. Merge to `main` frequently. Use feature flags for incomplete features rather than long-lived branches.
- **Shared ownership with natural specialization**: Anyone can work on any part of the codebase, but each module has a de facto expert. This person is the first reviewer for changes in their area, not a gatekeeper.
- **Lightweight ADRs (Architecture Decision Records)**: When making a significant technical decision, write a 1-page ADR (context, decision, consequences) in a `docs/decisions/` directory. This saves rehashing the same discussion months later.
- **Consistent tooling**: Everyone uses the same formatter, linter, and CI configuration. Automate formatting in pre-commit hooks. Eliminate style debates by adopting an opinionated formatter.
- **Daily standups are optional**: If the team communicates well asynchronously, skip standups. If alignment is drifting, add a 10-minute daily check-in. Re-evaluate monthly.

## Project Structure

```
project/
├── src/                     # Application source
│   ├── core/                # Shared business logic
│   ├── features/            # Feature modules (vertical slices)
│   │   ├── auth/
│   │   ├── billing/
│   │   └── dashboard/
│   └── infrastructure/      # Database, external services, config
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
│   ├── decisions/           # ADRs (001-use-postgres.md, etc.)
│   └── runbook.md           # How to deploy, rollback, debug
├── scripts/                 # Development and operational scripts
├── .github/
│   └── workflows/
│       ├── ci.yml           # Build, test, lint on PR
│       └── deploy.yml       # Deploy on merge to main
├── Makefile                 # Common dev commands
├── README.md                # Setup, architecture overview, contribution guide
└── CONTRIBUTING.md          # PR process, coding standards, review expectations
```

## Agent Instructions

1. **Organize code by feature, not by layer.** Group related files together (auth handler + auth service + auth tests) rather than separating all handlers, all services, and all tests into different directories. This makes it easy to understand and modify a feature in isolation.
2. **Write a CONTRIBUTING.md early.** Even with 2 people, documenting the PR process, commit conventions, and review expectations prevents misalignment. This document is also onboarding material for developer #3.
3. **Set up CI on day one.** Build, test, lint, and type-check on every PR. Block merges that fail CI. This is the cheapest quality investment you can make.
4. **Pair on architecture decisions.** Before building a significant feature, spend 30 minutes sketching the approach with a teammate. This prevents wasted work and spreads context.
5. **Review PRs as a top priority.** A PR waiting for review blocks a teammate. Review within 4 hours during working hours. If a PR is too large to review quickly, that is feedback that it should have been smaller.
6. **Rotate areas of responsibility.** Avoid knowledge silos. Periodically have someone else work in an unfamiliar area. Code review is a passive way to spread knowledge; pairing is an active way.
7. **Deploy automatically on merge to main.** If tests pass and a human approved the PR, deploy automatically. Manual deploy steps introduce delay and human error. Use feature flags for features that are not ready for users.
8. **Hold a retrospective every 2-4 weeks.** Discuss what is working, what is not, and what to change. Even a 30-minute conversation prevents small frustrations from becoming big problems.

## Testing Strategy

- **Unit tests**: Cover business logic and edge cases. Aim for 70-80% coverage on core modules. Do not chase 100%.
- **Integration tests**: Test the full request/response cycle for critical paths. Run against a real (test) database.
- **E2E tests**: 5-10 tests covering the most critical user journeys. Keep them stable and fast. Flaky E2E tests erode trust in the test suite.
- **Manual testing**: Acceptable for UI polish, visual design, and exploratory testing. Not a substitute for automated regression tests.

## Common Pitfalls

- **Not reviewing PRs promptly**: A 2-day review turnaround on a 5-person team means someone is always blocked. Set expectations: reviews within 4 hours.
- **Long-lived feature branches**: Branches that live for weeks accumulate merge conflicts and diverge from main. Merge daily. Use feature flags for incomplete work.
- **No decision documentation**: "We discussed it and agreed" is lost knowledge when a team member leaves or context is forgotten. Write a brief ADR for non-obvious decisions.
- **Premature specialization**: "Only Alice knows the billing code" is a bus factor of 1. Rotate responsibilities. Ensure at least two people can work in every area.
- **Skipping error monitoring**: In production without error tracking (Sentry, Bugsnag) means users report bugs before you know about them. Set up error alerting on day one.
- **Over-documenting process**: A 10-page contribution guide for a 3-person team is wasted effort. Keep process documentation to 1-2 pages. Update it when confusion actually arises.
- **Not having a shared dev environment setup**: If onboarding a new developer takes more than 1 hour, improve the setup scripts. A `make setup` or `docker-compose up` should get a new developer to a working state.
- **Ignoring technical debt**: Small teams move fast and accumulate shortcuts. Track technical debt in issues. Dedicate 10-20% of each iteration to paying it down before it compounds.
