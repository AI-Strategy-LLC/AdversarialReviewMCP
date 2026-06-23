+++
display_name = "Large / Enterprise (15+)"
applies_to = ["large-team", "enterprise", "platform", "multi-team", "15-plus-developers", "corporate"]
+++

# Large / Enterprise (15+) Scale Guidance

## Characteristics

Large engineering organizations operate multiple teams that must coordinate without
creating bottlenecks. The core challenge shifts from "how do we write good code" to
"how do we enable dozens or hundreds of developers to ship independently without
breaking each other's work." Success requires platform thinking, clear ownership,
and governance that enables autonomy rather than enforcing control.

Defining traits:
- Multiple teams own different services, modules, or products.
- Teams must be able to deploy independently. Cross-team coordination for every release kills velocity.
- Platform teams provide shared infrastructure, libraries, and tooling that product teams consume.
- Architectural decisions affect many teams and require an RFC/proposal process.
- Compliance, security, and audit requirements are non-negotiable and must be automated.
- New developers join frequently. Onboarding effectiveness directly impacts team capacity.

## Key Conventions

- **Service ownership**: Every service has a designated owning team. The owning team is responsible for development, deployment, on-call, SLAs, and documentation. No orphan services.
- **Inner source model**: Teams can contribute to other teams' services via PRs, but the owning team has final merge authority. Contributing guidelines are published for each service.
- **RFC process for cross-team changes**: Any change that affects multiple teams (new shared library, API contract change, infrastructure migration) requires a written RFC. RFCs have a review period, designated approvers, and are archived for future reference.
- **ADR (Architecture Decision Records)**: Mandatory for all significant technical decisions. Stored in a central, searchable location. Include context, decision, rationale, alternatives considered, and consequences.
- **SLAs and SLOs**: Every production service has defined SLOs (latency p99, availability, error rate). SLOs are monitored and reported. Teams are accountable for their services' SLO compliance. Error budgets govern deployment risk tolerance.
- **Change management**: Production changes follow a defined process: PR review, CI checks, staging validation, gradual rollout (canary or blue-green), monitoring, and rollback criteria. High-risk changes require a change review board approval.
- **Security reviews**: Any change that introduces new authentication, authorization, data storage, third-party integrations, or network exposure requires a security review before deployment.
- **Compliance automation**: SOC2, HIPAA, PCI-DSS, or GDPR requirements are enforced via automated policy checks in CI/CD. Manual compliance checklists are supplemented, not replaced, by automation.

## Project Structure

```
organization/
├── platform/                    # Platform team owned
│   ├── shared-libraries/        # Common libraries (auth, logging, config)
│   │   ├── auth-sdk/
│   │   ├── logging/
│   │   ├── observability/
│   │   └── feature-flags/
│   ├── infrastructure/          # Shared IaC modules
│   │   ├── modules/
│   │   └── templates/
│   ├── ci-templates/            # Reusable CI/CD pipeline templates
│   └── developer-portal/        # Service catalog, docs, onboarding
│
├── services/                    # Product teams own individual services
│   ├── user-service/            # Owned by Team Alpha
│   │   ├── src/
│   │   ├── api-spec/            # OpenAPI or protobuf definitions
│   │   ├── docs/
│   │   │   ├── ADRs/
│   │   │   ├── runbook.md
│   │   │   └── on-call-guide.md
│   │   ├── deploy/              # K8s manifests, Terraform
│   │   ├── OWNERS               # Team ownership declaration
│   │   └── SLO.yaml             # Service level objectives
│   ├── order-service/           # Owned by Team Beta
│   └── notification-service/    # Owned by Team Gamma
│
├── rfcs/                        # Cross-team proposals
│   ├── 001-auth-migration.md
│   ├── 002-event-schema-v2.md
│   └── template.md
│
├── docs/
│   ├── architecture/            # System-wide architecture
│   │   ├── system-context.md
│   │   ├── service-map.md
│   │   └── data-flow.md
│   ├── standards/               # Engineering standards
│   │   ├── api-design.md
│   │   ├── logging.md
│   │   ├── security.md
│   │   └── testing.md
│   ├── onboarding/              # New developer guide
│   └── incident-response/       # Incident playbooks
│
└── tools/                       # Developer tooling
    ├── service-scaffold/        # New service template generator
    ├── local-dev/               # Docker Compose for local multi-service dev
    └── migration-helpers/       # Cross-service migration scripts
```

## Agent Instructions

1. **Understand the ownership model before making changes.** Check the OWNERS file or CODEOWNERS for every repository you touch. Understand which team owns the code and follow their contributing guidelines. Do not make cross-service changes without an RFC.
2. **Use platform-provided libraries for cross-cutting concerns.** Authentication, logging, tracing, feature flags, configuration, and health checks should all use the platform team's shared libraries. Do not build custom solutions for solved problems.
3. **Define API contracts before implementation.** Publish OpenAPI specs or protobuf definitions. Consumer teams depend on these contracts. Changes to contracts require notification and migration support for all consumers.
4. **Write RFCs for any change affecting more than one team.** Include the problem statement, proposed solution, alternatives considered, migration plan, and rollback strategy. Allow a minimum 1-week review period. Get explicit sign-off from affected teams.
5. **Automate compliance checks.** Every security, compliance, and governance requirement that can be checked automatically must be checked in CI. Manual reviews are for judgment calls, not checklists. Examples: no secrets in code, encrypted data at rest, audit logging enabled, no public network exposure without approval.
6. **Invest in the developer portal.** Maintain a searchable catalog of services, their owners, API documentation, SLOs, and runbooks. New developers should be able to find any service's documentation within 5 minutes.
7. **Implement structured incident response.** Define severity levels. Automate on-call rotation. Run blameless post-mortems for every significant incident. Track action items to completion. Publish incident reports internally.
8. **Standardize observability.** All services must emit metrics, structured logs, and distributed traces using the platform-provided libraries. Dashboards follow a standard template. On-call engineers should be able to diagnose issues in any service, not just their own.

## Testing Strategy

- **Unit and integration tests**: Standard per-service testing. Each team manages their own test suite. Platform team provides testing utilities and test infrastructure.
- **Contract tests**: Verify that API producers and consumers agree on contract details. Use Pact or similar tools. Run contract tests in both producer and consumer CI pipelines.
- **E2E tests**: Owned by QA teams or shared test infrastructure. Run against staging with all services deployed. Focus on critical cross-service workflows.
- **Canary and shadow testing**: Deploy new versions to a small percentage of traffic. Compare metrics against the stable version. Automatically roll back on regression.
- **Chaos engineering**: Regular failure injection in staging. Verify circuit breakers, timeouts, fallbacks, and graceful degradation. Game days for large-scale failure scenarios.
- **Security testing**: Automated SAST/DAST scanning in CI. Regular penetration testing by a dedicated security team. Bug bounty program for external researchers.
- **Compliance audits**: Quarterly automated compliance scans. Annual third-party audits. Automated evidence collection for audit trails.

## Common Pitfalls

- **Distributed monolith**: Services that must be deployed together, share databases, or have tight runtime coupling. If two services cannot be deployed independently, they are not separate services. Merge them or fix the coupling.
- **Platform team as bottleneck**: If product teams are blocked waiting for platform changes, the platform team's prioritization is wrong. Provide self-service APIs and extensible frameworks. Allow product teams to contribute to platform code via inner source.
- **RFC process that blocks velocity**: RFCs that take months to approve kill momentum. Set maximum review periods (1-2 weeks). Define escalation paths. Allow provisional implementation during review for non-breaking changes.
- **Inconsistent standards across teams**: Team A logs in JSON, Team B logs in plaintext, Team C does not log at all. An on-call engineer cannot diagnose cross-service issues. Enforce shared standards for logging, error handling, and API design.
- **No service decommissioning process**: Old services are never shut down. They accumulate vulnerabilities and operational burden. Define a service lifecycle with explicit decommission steps: migrate consumers, archive code, remove infrastructure.
- **Tribal knowledge for incident response**: "Ask Sarah, she knows how this works" does not scale and creates single points of failure. Document everything in runbooks. Test runbooks by having someone who has never operated the service follow them.
- **Ignoring developer experience**: Slow builds, flaky tests, complex local setup, and poor documentation compound across dozens of developers. A 10-minute improvement in developer setup saves hundreds of hours per year at scale.
- **Security as a gate instead of a guardrail**: Security reviews that block releases for weeks breed resentment and workarounds. Provide automated security scanning, approved libraries, and security champions within each team. Reserve manual reviews for genuinely novel risk.
