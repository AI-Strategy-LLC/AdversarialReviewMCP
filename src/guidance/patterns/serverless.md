+++
display_name = "Serverless"
applies_to = ["all"]
+++

# Serverless Architecture

## When to Use

- Event-driven workloads with variable or unpredictable traffic patterns where paying for idle compute is wasteful.
- API backends with bursty traffic (e.g., webhook receivers, form processors, scheduled tasks) that do not need persistent server processes.
- Data processing pipelines triggered by file uploads, database changes, or message queue events.
- Prototypes and MVPs where minimizing infrastructure management accelerates delivery.

## Key Principles

1. **Functions are Stateless** -- Every function invocation starts with a clean slate. No in-memory state persists between invocations. All state must be stored externally (database, cache, object storage). Design every handler as if it could execute on a different machine each time.
2. **Single Responsibility per Function** -- Each function handles one event type and performs one logical operation. A function that processes orders, sends emails, and updates inventory should be three separate functions connected by events.
3. **Event-Driven by Default** -- Functions are triggered by events: HTTP requests, message queue messages, file uploads, scheduled timers, database streams. Design the system as a graph of events and handlers, not a call chain of functions.
4. **Cold Starts Are Real** -- The first invocation after idle time incurs initialization overhead (loading runtime, dependencies, establishing connections). Design for it: keep dependencies minimal, use provisioned concurrency for latency-sensitive paths, and choose lightweight runtimes.
5. **Infrastructure as Code** -- Every function, trigger, permission, and resource is defined in code (SAM, CDK, Terraform, Serverless Framework, Pulumi). No manual console configuration. The infrastructure definition is versioned alongside the application code.
6. **Cost-Aware Design** -- You pay per invocation and per millisecond of execution. Optimize for: fast execution time, minimal memory allocation, efficient external calls, and avoiding unnecessary invocations. Monitor costs alongside performance.

## Project Structure

```
project/
+-- functions/
|   +-- api/                        # HTTP-triggered functions
|   |   +-- create_order/
|   |   |   +-- handler.{ext}      # Function entry point
|   |   |   +-- validator.{ext}    # Input validation
|   |   |   +-- response.{ext}     # Response formatting
|   |   +-- get_order/
|   |   |   +-- handler.{ext}
|   |   +-- list_orders/
|   |       +-- handler.{ext}
|   +-- events/                     # Event-triggered functions
|   |   +-- process_payment/
|   |   |   +-- handler.{ext}
|   |   +-- send_notification/
|   |   |   +-- handler.{ext}
|   |   +-- resize_image/
|   |       +-- handler.{ext}
|   +-- scheduled/                  # Timer-triggered functions
|       +-- daily_report/
|           +-- handler.{ext}
+-- shared/                         # Code shared across functions
|   +-- models/
|   |   +-- order.{ext}
|   |   +-- user.{ext}
|   +-- services/
|   |   +-- order_service.{ext}    # Business logic
|   |   +-- payment_service.{ext}
|   +-- repositories/
|   |   +-- order_repository.{ext}
|   +-- utils/
|       +-- response_builder.{ext}
|       +-- error_handler.{ext}
|       +-- logger.{ext}
+-- infrastructure/                 # IaC definitions
|   +-- main.tf                     # or template.yaml, cdk.ts, serverless.yml
|   +-- api_gateway.tf
|   +-- functions.tf
|   +-- database.tf
|   +-- iam.tf                      # Permissions (least privilege)
|   +-- monitoring.tf
+-- tests/
|   +-- unit/
|   |   +-- functions/
|   |   +-- shared/
|   +-- integration/
|   |   +-- api/                    # Test against deployed or local API
|   +-- load/
|       +-- scenarios/              # Load test definitions
+-- scripts/
|   +-- deploy.sh
|   +-- local-invoke.sh
+-- package.json                    # or Cargo.toml, requirements.txt, go.mod
```

## Agent Instructions

### Function Handler Template

Every function handler should follow this structure:

```
export async function handler(event, context):
    try:
        # 1. Parse and validate input from event
        input = parse_event(event)
        validate(input)

        # 2. Execute business logic (delegate to shared services)
        result = await order_service.process(input)

        # 3. Return formatted response
        return success_response(result)
    catch ValidationError:
        return error_response(400, "Invalid input", details)
    catch NotFoundError:
        return error_response(404, "Not found")
    catch:
        log.error("Unhandled error", error)
        return error_response(500, "Internal error")
```

- Keep the handler itself under 30 lines. It is glue between the event and your business logic.
- Business logic lives in `shared/services/`, not in the handler.
- Never catch and silently swallow errors. Log them and return appropriate error responses.

### API Gateway + Function Pattern

For HTTP APIs, structure the mapping as:

```
API Gateway:
  POST   /orders          -> functions/api/create_order/handler
  GET    /orders/{id}     -> functions/api/get_order/handler
  GET    /orders          -> functions/api/list_orders/handler
  DELETE /orders/{id}     -> functions/api/delete_order/handler
```

- One function per HTTP method + resource combination.
- Use path parameters and query strings, not function-level routing.
- Validate request bodies using JSON Schema at the API Gateway level as a first pass, and in the handler for business validation.

### Cold Start Mitigation

- **Minimize dependencies**: Every imported library adds to initialization time. Audit and prune.
- **Lazy initialization**: Do not establish database connections at module load time. Initialize on first invocation, then reuse across warm invocations.
- **Connection pooling**: Use managed connection pools (RDS Proxy, PgBouncer) to avoid per-invocation connection overhead.
- **Provisioned concurrency**: For latency-sensitive functions (user-facing API), configure provisioned concurrency to keep instances warm.
- **Choose fast runtimes**: Go and Rust have near-zero cold starts. Python and Node.js are moderate. Java and .NET have the longest cold starts without optimization (GraalVM native image or ReadyToRun can help).

### Cost Optimization

- Set memory allocations based on profiling, not guesswork. More memory also means more CPU.
- Use reserved concurrency to cap costs on non-critical functions.
- Batch process where possible (process 100 SQS messages per invocation, not 1).
- Avoid synchronous chaining of functions (Function A calls Function B calls Function C). Use events or Step Functions instead.
- Monitor with cost alerts. Set per-function cost budgets.

### Naming Conventions

- **Function names**: `{resource}-{action}` or `{trigger}-{action}` -- `order-create`, `payment-process`, `image-resize`.
- **Handler files**: `handler.{ext}` in a directory named after the function.
- **Infrastructure resources**: `{project}-{env}-{resource}` -- `myapp-prod-orders-table`, `myapp-staging-create-order-fn`.

## Common Pitfalls

1. **Monolith in a Lambda** -- A single function that handles all routes, all events, and all logic. This defeats the purpose of serverless. Each function should handle one trigger and one operation.
2. **Synchronous Function Chains** -- Function A synchronously invokes Function B, which invokes Function C. Latency compounds, errors cascade, and costs multiply. Use asynchronous events or orchestrators (Step Functions, Durable Functions).
3. **Ignoring Cold Starts** -- Deploying a Java function with 50 dependencies that takes 8 seconds to cold-start, then wondering why user-facing API latency is bad. Profile and optimize initialization.
4. **No Local Development Story** -- Deploying to the cloud for every test iteration is slow. Use local emulators (SAM local, LocalStack, Serverless Offline) for rapid iteration.
5. **Over-Permissioned Functions** -- Giving every function `AdministratorAccess` or `*` permissions. Apply least-privilege IAM: each function gets only the specific permissions it needs for the specific resources it accesses.

## Platform-Specific Notes

### AWS Lambda

- Use SAM (Serverless Application Model) or CDK for infrastructure definition.
- Prefer API Gateway HTTP API (v2) over REST API (v1) for lower cost and simpler configuration.
- Use DynamoDB for serverless-native persistence. Use RDS Proxy for relational databases.
- Lambda Layers for shared dependencies across functions.
- Step Functions for orchestrating multi-step workflows.
- X-Ray for distributed tracing across Lambda invocations.

### Google Cloud Functions / Cloud Run

- Cloud Functions for simple event-driven functions. Cloud Run for containerized services with serverless scaling.
- Firestore or Cloud SQL for persistence.
- Pub/Sub for asynchronous event triggers.
- Cloud Workflows for orchestration.

### Azure Functions

- Use Durable Functions for stateful orchestration patterns (fan-out/fan-in, human interaction, chaining).
- Cosmos DB for serverless-native persistence.
- Service Bus for event messaging.
- Application Insights for monitoring and tracing.

### Vercel / Netlify (Edge Functions)

- Optimized for frontend-adjacent API routes and middleware.
- Keep functions extremely lightweight; they run on edge nodes with limited resources.
- Use for: authentication checks, API proxying, content personalization, A/B testing.

### Rust on Lambda

- Near-zero cold starts with the `lambda_runtime` crate.
- Compile with `--release` and `target x86_64-unknown-linux-musl` for minimal binary size.
- Use `cargo-lambda` for local development and deployment.
- Ideal for latency-sensitive, compute-heavy functions.

### Cost Monitoring Checklist

- Set CloudWatch / monitoring alerts for invocation count and duration.
- Review monthly cost breakdown per function.
- Identify and optimize the top 5 most-invoked and longest-running functions.
- Use reserved concurrency to prevent runaway costs from recursive invocations.
- Consider Savings Plans or committed use discounts for predictable baseline load.
