+++
display_name = "DevOps / Infrastructure"
applies_to = ["devops", "infrastructure", "ci-cd", "cloud", "kubernetes", "docker", "terraform", "ansible", "monitoring"]
+++

# DevOps / Infrastructure Domain Guidance

## Characteristics

DevOps and infrastructure work focuses on the systems that build, deploy, run, and
monitor applications. The goal is reliable, repeatable, and auditable operations.
Everything should be codified -- infrastructure, configuration, pipelines, and runbooks.
Manual steps are bugs. The core principle is that production should be reproducible
from version control alone.

Key architectural decisions:
- **Infrastructure as Code (IaC)**: Terraform for cloud resources, Ansible/Chef for configuration management, Pulumi for teams that prefer general-purpose languages. Never create infrastructure manually.
- **Container orchestration**: Kubernetes for complex multi-service systems. Docker Compose for simple deployments. ECS/Cloud Run for managed container hosting without Kubernetes overhead.
- **CI/CD platform**: GitHub Actions, GitLab CI, or Jenkins. Prefer managed services over self-hosted. Pipelines should be fast (under 10 minutes for PR checks, under 30 minutes for full deploy).
- **Observability stack**: Metrics (Prometheus/Datadog), Logs (ELK/Loki), Traces (Jaeger/Tempo). All three are required for production systems.

## Key Conventions

- **GitOps**: All infrastructure and configuration lives in version control. Changes are applied via pull requests, reviewed, and merged. No `kubectl apply` from a laptop. No SSH to production servers.
- **Immutable infrastructure**: Do not patch running servers. Build new images, deploy them, and tear down old ones. This applies to VM images, Docker containers, and Lambda function packages.
- **Environment parity**: Development, staging, and production should differ only in scale and secrets. Use the same Docker images, the same Terraform modules (parameterized), and the same deployment process.
- **Secrets management**: Never commit secrets to version control. Use a dedicated secrets manager (Vault, AWS Secrets Manager, 1Password). Inject secrets at deploy time as environment variables or mounted files.
- **Tagging and labeling**: Every cloud resource must have tags for `environment`, `team`, `service`, and `cost-center`. Every Kubernetes resource must have labels for `app`, `version`, and `component`.
- **Least privilege**: Service accounts, IAM roles, and API keys should have the minimum permissions required. Audit permissions quarterly. Rotate credentials regularly.

## Project Structure

```
infrastructure/
├── terraform/               # IaC definitions
│   ├── modules/             # Reusable modules
│   │   ├── vpc/
│   │   ├── database/
│   │   └── kubernetes/
│   ├── environments/        # Per-environment config
│   │   ├── dev/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── terraform.tfvars
│   │   ├── staging/
│   │   └── production/
│   └── backend.tf           # State backend config
├── kubernetes/              # K8s manifests or Helm charts
│   ├── base/                # Kustomize base
│   ├── overlays/            # Per-environment overlays
│   │   ├── dev/
│   │   ├── staging/
│   │   └── production/
│   └── charts/              # Helm charts
├── docker/                  # Dockerfiles
│   ├── app.Dockerfile
│   └── worker.Dockerfile
├── ci/                      # CI/CD pipeline definitions
│   ├── build.yml
│   ├── test.yml
│   └── deploy.yml
├── monitoring/              # Dashboards and alert definitions
│   ├── dashboards/
│   ├── alerts/
│   └── runbooks/
└── scripts/                 # Operational scripts
    ├── backup.sh
    ├── restore.sh
    └── rotate-secrets.sh
```

## Agent Instructions

1. **Start with the CI/CD pipeline.** Before any infrastructure, ensure code can be built, tested, and packaged automatically. A passing CI pipeline is the foundation of everything else.
2. **Define infrastructure as reusable modules.** Write Terraform modules for each logical component (network, database, compute). Parameterize for environment differences. Share modules across environments.
3. **Implement health checks and readiness probes.** Every service must have HTTP health endpoints. Kubernetes liveness and readiness probes prevent traffic from reaching unhealthy instances.
4. **Set up monitoring before the first production deployment.** Define dashboards for the four golden signals: latency, traffic, errors, and saturation. Configure alerts for SLO breaches, not arbitrary thresholds.
5. **Write runbooks for every alert.** Each alert should link to a runbook that describes what the alert means, how to diagnose the issue, and what remediation steps to take. Update runbooks after every incident.
6. **Implement a disaster recovery plan.** Document and test backup/restore procedures. Define RTO (Recovery Time Objective) and RPO (Recovery Point Objective). Run DR drills quarterly.
7. **Automate certificate and secret rotation.** TLS certificates expire. API keys get compromised. Build automation that rotates credentials with zero downtime.
8. **Log everything, but log structured.** Use JSON-formatted structured logs with consistent fields: `timestamp`, `level`, `service`, `request_id`, `message`. Enable log-based alerting for critical errors.

## Testing Strategy

- **Terraform plan review**: Run `terraform plan` in CI for every infrastructure change PR. Require human review of the plan before applying.
- **Policy as code**: Use OPA/Conftest or Sentinel to enforce infrastructure policies (no public S3 buckets, encryption at rest, required tags).
- **Container scanning**: Scan Docker images for known vulnerabilities (Trivy, Snyk). Block deployment of images with critical CVEs.
- **Smoke tests after deploy**: Run a lightweight test suite against the deployed environment to verify basic functionality after every deployment.
- **Chaos engineering**: Periodically inject failures (kill pods, increase latency, exhaust resources) to verify resilience. Start with controlled experiments in staging.

## Common Pitfalls

- **Manual infrastructure changes**: "Just this once" manual changes create configuration drift that causes outages. If you change something manually, codify it immediately.
- **Shared Terraform state without locking**: Multiple concurrent applies corrupt state. Always use a remote backend with state locking (S3+DynamoDB, Terraform Cloud).
- **No rollback plan**: Every deployment should have a tested rollback path. Blue-green or canary deployments enable instant rollback. If rollback requires manual intervention, the deploy process is incomplete.
- **Alert fatigue**: Too many noisy alerts cause teams to ignore them. Tune thresholds, silence non-actionable alerts, and ensure every alert is linked to a runbook. If an alert fires and no action is taken, delete or fix it.
- **Deploying on Fridays**: Avoid deploying to production before weekends or holidays. If you must, ensure on-call coverage and a rollback plan.
- **Monolithic CI pipelines**: One long pipeline that runs everything sequentially. Split into parallel stages. Cache dependencies. Only run tests affected by changes.
- **Insufficient logging in production**: Debug logging disabled. Traces not sampled. When an incident occurs, there is not enough data to diagnose. Enable structured logging and ensure retention covers your incident response window (typically 30-90 days).
- **No cost monitoring**: Cloud bills grow silently. Set up cost alerts, review spending weekly, and tag resources for cost allocation. Clean up orphaned resources monthly.
