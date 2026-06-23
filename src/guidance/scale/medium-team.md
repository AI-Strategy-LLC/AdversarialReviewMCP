+++
display_name = "Medium Team (6-15)"
applies_to = ["medium-team", "growth-stage", "scaling-team", "6-15-developers", "multi-team"]
+++

# Medium Team (6-15) Scale Guidance

## Characteristics

Medium teams have crossed the threshold where everyone knowing everything is no longer
feasible. Sub-teams or areas of ownership emerge. Communication requires more
structure because not everyone is in every conversation. The challenge is maintaining
development velocity while adding enough process to prevent coordination failures.

Defining traits:
- Developers specialize in areas (frontend, backend, infrastructure, specific features).
- Not everyone can review every PR effectively. Domain expertise matters for reviews.
- A team lead or tech lead coordinates work and makes architectural decisions.
- Sprint or iteration planning is needed to avoid conflicting work and wasted effort.
- The codebase is large enough that a new developer cannot understand it all in their first week.

## Key Conventions

- **CODEOWNERS**: Define ownership for every directory and critical file. Use GitHub/GitLab CODEOWNERS to automatically assign reviewers. This ensures changes are reviewed by someone who understands the affected code.
- **Branch protection on main**: Require at least one approval from a CODEOWNER. Require passing CI. Require branches to be up-to-date before merging. No force pushes to main.
- **Required reviews with domain expertise**: PRs modifying database schemas require a backend reviewer. PRs modifying infrastructure require a DevOps reviewer. PRs modifying public APIs require an API owner reviewer.
- **Sprint/iteration planning**: 1-2 week iterations. Plan work at the start. Demo completed work at the end. Adjust scope mid-iteration when needed. The goal is predictability, not rigidity.
- **Shared component libraries**: Extract common UI components, utilities, and patterns into shared modules. Prevent duplication across features. Maintain a design system if the product has a user interface.
- **Style guides enforced by automation**: Use linters and formatters with CI enforcement. Code style discussions should happen once (when configuring the linter), not on every PR. Document non-automatable conventions in a style guide.
- **Structured onboarding**: New developers follow a documented onboarding checklist: environment setup, architecture overview, first small PR, meeting the team, understanding the release process.

## Project Structure

```
project/
├── .github/
│   ├── CODEOWNERS               # Ownership rules
│   ├── PULL_REQUEST_TEMPLATE.md # PR checklist
│   └── workflows/
│       ├── ci.yml               # Build, test, lint
│       ├── deploy-staging.yml   # Auto-deploy to staging on merge
│       └── deploy-prod.yml     # Deploy to prod (manual trigger or tag)
├── packages/ or crates/         # Modular codebase
│   ├── core/                    # Shared domain logic
│   ├── api/                     # API layer
│   ├── web/                     # Frontend application
│   ├── worker/                  # Background job processor
│   └── shared-ui/               # Shared component library
├── infrastructure/              # IaC (Terraform, K8s manifests)
├── docs/
│   ├── architecture/            # System architecture diagrams and docs
│   │   ├── overview.md
│   │   └── diagrams/
│   ├── decisions/               # ADRs
│   ├── api/                     # API documentation
│   ├── onboarding/              # New developer guide
│   └── runbooks/                # Operational procedures
├── scripts/
│   ├── setup.sh                 # Development environment setup
│   └── seed-db.sh               # Database seeding
├── CONTRIBUTING.md              # Development process and standards
└── README.md                    # Project overview and quick start
```

## Agent Instructions

1. **Establish clear module boundaries.** Divide the codebase into packages/crates/modules with explicit public APIs. Each module should have an owner listed in CODEOWNERS. Cross-module dependencies should be intentional and reviewed.
2. **Create a PR template.** Include a checklist: description of changes, how to test, related issues, screenshot (for UI changes), database migration (yes/no), API changes (yes/no), feature flag (yes/no). This standardizes review without adding bureaucracy.
3. **Implement a staging environment that mirrors production.** Auto-deploy to staging on every merge to main. QA and stakeholders validate in staging before production release. Keep staging data realistic (anonymized production snapshots).
4. **Define a release process.** Whether you use release branches, tags, or continuous deployment -- document it. Everyone should know how code gets from merge to production and how to roll back.
5. **Run architecture reviews for cross-cutting changes.** Changes that affect multiple modules need review from leads of all affected areas. Schedule a 30-minute review before implementation begins, not after a large PR is submitted.
6. **Invest in developer experience tooling.** Fast builds, reliable tests, easy local setup. If the build takes more than 5 minutes locally, optimize it. If tests are flaky, fix them. Developer productivity is a multiplier.
7. **Maintain API documentation.** Internal APIs (between modules) and external APIs (for consumers) must be documented and kept up to date. Generate documentation from code where possible.
8. **Track and manage technical debt explicitly.** Maintain a tech debt register or label issues with `tech-debt`. Allocate 15-20% of sprint capacity to debt reduction. Prioritize debt that slows feature development.

## Testing Strategy

- **Unit tests**: Every module has comprehensive unit tests. New code requires tests. Test coverage tracked but not used as a gate (aim for 75%+ on core modules).
- **Integration tests**: Test interactions between modules. Run against a real database and message queue in CI.
- **E2E tests**: Automated tests for critical user journeys. Run before every production deploy. Owned by QA or a dedicated test engineer.
- **Performance tests**: Run weekly in CI against staging. Track response times, throughput, and resource usage. Alert on regressions.
- **Security scanning**: Automated dependency vulnerability scanning (Dependabot, Snyk). SAST scanning in CI. Periodic penetration testing.

## Common Pitfalls

- **Implicit ownership**: "Everyone owns everything" means nobody feels responsible. Define CODEOWNERS. Every file should have at least one owner who is accountable for its quality.
- **Review bottlenecks**: One or two senior developers review all PRs. This creates a bottleneck and prevents others from developing review skills. Distribute review responsibility. Use CODEOWNERS to route reviews to the right people.
- **Inconsistent coding patterns across modules**: Without shared conventions, each module develops its own style. This increases cognitive load when moving between modules. Enforce conventions with linters and shared templates.
- **No architecture documentation**: New developers cannot understand the system. Architecture documents get outdated. Maintain high-level diagrams and module descriptions. Review and update quarterly.
- **Meeting overload**: Stand-ups, sprint planning, retros, architecture reviews, tech talks. Protect focus time. Batch meetings into specific days. Default to async communication.
- **Staging environment drift**: Staging diverges from production in data, configuration, or infrastructure. This reduces confidence in staging validation. Automate staging refresh from production (with data anonymization).
- **Deploying database migrations separately from code**: Schema changes and the code that depends on them must be coordinated. Use backward-compatible migrations (add column, backfill, deploy code, remove old column) to enable independent deploys.
- **Not investing in CI speed**: A 30-minute CI pipeline on a 10-person team means dozens of hours wasted per week waiting. Parallelize test suites, cache dependencies, and use incremental builds.
