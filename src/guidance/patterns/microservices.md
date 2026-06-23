+++
display_name = "Microservices"
applies_to = ["all"]
+++

# Microservices Architecture

## When to Use

- Large systems with multiple teams that need to deploy independently on different release cadences.
- Applications where different components have fundamentally different scaling requirements (e.g., image processing vs. user authentication).
- Organizations with mature DevOps practices: CI/CD pipelines, container orchestration, centralized logging, and distributed tracing already in place.
- When domain boundaries are well-understood and stable -- premature service extraction creates more problems than it solves.

**When NOT to use**: Small teams (fewer than 5-8 developers), early-stage products where domain boundaries are still shifting, projects without operational maturity for distributed systems, or when a well-structured monolith can serve the same purpose with less complexity.

## Key Principles

1. **Single Responsibility per Service** -- Each service owns one bounded context from the domain. It has its own data, its own business rules, and its own deployment pipeline. A service should be small enough for one team to own entirely.
2. **Database per Service** -- Services do not share databases. Each service owns its datastore. If another service needs that data, it requests it through the API or consumes events. This is non-negotiable for true independence.
3. **API Contracts are Sacred** -- The public API of a service is a contract. Changes must be backward-compatible or versioned. Use schema registries, contract testing (Pact), and API versioning strategies from day one.
4. **Design for Failure** -- Every network call can fail. Implement circuit breakers, retries with exponential backoff, timeouts, and bulkheads. Services must degrade gracefully when dependencies are unavailable.
5. **Prefer Asynchronous Communication** -- Use events/messages for operations that do not require an immediate response. Synchronous HTTP/gRPC calls between services create temporal coupling and cascading failures.
6. **Observability is Not Optional** -- Distributed tracing (OpenTelemetry), centralized logging (structured JSON), health checks, and metrics dashboards must be built in from the start, not bolted on later.

## Project Structure

### Per-Service Structure

```
services/
+-- order-service/
|   +-- src/
|   |   +-- api/                    # HTTP/gRPC handlers
|   |   |   +-- routes.{ext}
|   |   |   +-- handlers/
|   |   +-- domain/                 # Business logic
|   |   |   +-- order.{ext}
|   |   |   +-- order_service.{ext}
|   |   +-- events/                 # Event publishing/consuming
|   |   |   +-- publishers.{ext}
|   |   |   +-- consumers.{ext}
|   |   +-- infrastructure/         # DB, external clients
|   |       +-- order_repository.{ext}
|   |       +-- payment_client.{ext}
|   +-- migrations/
|   +-- tests/
|   +-- Dockerfile
|   +-- docker-compose.yml          # Local development
|   +-- openapi.yaml                # API specification
|   +-- Makefile                    # build, test, run, deploy
+-- user-service/
|   +-- ...                         # Same internal structure
+-- notification-service/
|   +-- ...
+-- api-gateway/
|   +-- ...                         # Routes external requests to services
shared/
+-- proto/                          # Shared protobuf definitions (if using gRPC)
+-- contracts/                      # Pact contract test definitions
+-- schemas/                        # Event schema definitions (Avro/JSON Schema)
infra/
+-- kubernetes/                     # K8s manifests or Helm charts
+-- terraform/                      # Infrastructure as Code
+-- docker-compose.yml              # Full-stack local development
```

## Agent Instructions

### Creating a New Service

1. **Define the bounded context** -- Document what domain concepts this service owns. List the entities, commands, and events it is responsible for.
2. **Design the API contract first** -- Write the OpenAPI spec (REST) or protobuf definitions (gRPC) before writing code. Share the contract with consuming teams for review.
3. **Define events** -- List the domain events this service will publish and the events from other services it will consume. Use a schema registry format (Avro, JSON Schema, or protobuf).
4. **Scaffold from the standard template** -- Use the per-service structure above. Every service gets its own Dockerfile, CI pipeline, and database migration setup.
5. **Implement health endpoints** -- Every service must expose `/health` (liveness) and `/ready` (readiness) endpoints from day one.
6. **Add distributed tracing** -- Instrument all incoming and outgoing requests with trace context propagation (W3C Trace Context or B3 headers).

### Inter-Service Communication

- **Synchronous (HTTP/gRPC)**: Use for queries that need an immediate response. Always set timeouts. Always implement circuit breakers. Never chain more than 2-3 synchronous calls deep.
- **Asynchronous (Events/Messages)**: Use for commands and notifications. Publish domain events to a message broker (Kafka, RabbitMQ, NATS). Consumers process events independently.
- **Event Schema Convention**: Events are named `{Service}.{Entity}.{Action}` -- e.g., `OrderService.Order.Created`, `PaymentService.Payment.Failed`.

### Data Consistency

- Accept eventual consistency as the default. Services sync state through events.
- For operations that span services, use the Saga pattern (choreography or orchestration) rather than distributed transactions.
- Implement idempotency keys for all write operations to handle message redelivery.

### Naming Conventions

- **Services**: `{domain-concept}-service` -- e.g., `order-service`, `inventory-service`.
- **Events**: `{entity}.{past_tense_verb}` -- e.g., `Order.Placed`, `Payment.Completed`.
- **API paths**: `/{resource-plural}` -- e.g., `/orders`, `/users/{id}`.

## Common Pitfalls

1. **Distributed Monolith** -- Services that must be deployed together, share databases, or make synchronous calls in chains. If you cannot deploy one service without touching another, you do not have microservices.
2. **Premature Decomposition** -- Splitting services before understanding domain boundaries leads to constant cross-service refactoring. Start with a modular monolith and extract services when boundaries are proven.
3. **Shared Database** -- Two services reading/writing the same tables creates hidden coupling that defeats the entire purpose of service independence.
4. **No Contract Testing** -- Without consumer-driven contract tests, API changes in one service silently break consumers. Use Pact or similar tools.
5. **Ignoring Operational Complexity** -- Microservices multiply operational surface area. Without centralized logging, tracing, monitoring, and automated deployment, the system becomes unmanageable.

## Platform-Specific Notes

### Java / Kotlin (Spring Boot)

- Use Spring Boot for service scaffolding. Spring Cloud provides circuit breakers (Resilience4j), service discovery (Eureka/Consul), and config management.
- Use Spring Cloud Stream for event-driven communication with Kafka/RabbitMQ.
- Each service is a separate Gradle/Maven module or repository.

### Go

- Standard library `net/http` or frameworks like Gin/Chi for HTTP services.
- Use gRPC with protobuf for inter-service communication where performance matters.
- Each service is a separate Go module with its own `go.mod`.
- Use the `context` package for trace propagation and cancellation.

### Node.js / TypeScript

- Use NestJS for structured service scaffolding with built-in DI, guards, and interceptors.
- Use `@nestjs/microservices` for transport-agnostic inter-service communication.
- Prefer TypeScript for type safety across service boundaries.

### Rust

- Use Axum or Actix-web for HTTP services. Tonic for gRPC.
- Each service is a separate binary crate. Shared types can be a library crate.
- Use OpenTelemetry crate for tracing instrumentation.

### Infrastructure

- **Containers**: Every service must have a Dockerfile. Use multi-stage builds.
- **Orchestration**: Kubernetes is the standard. Define resource limits, health probes, and pod disruption budgets.
- **Service Mesh**: Consider Istio or Linkerd for mTLS, traffic management, and observability at scale.
- **CI/CD**: Each service gets its own pipeline. Deploy independently. Never batch-deploy multiple services.
