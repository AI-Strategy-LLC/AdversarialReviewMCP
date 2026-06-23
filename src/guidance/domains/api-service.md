+++
display_name = "API Service"
applies_to = ["api", "rest", "graphql", "grpc", "backend", "microservice", "web-service"]
+++

# API Service Domain Guidance

## Characteristics

API services expose programmatic interfaces over a network for consumption by
frontends, mobile apps, other services, or third-party integrators. They must be
reliable, well-documented, backward-compatible, and secure. The API surface is a
contract -- breaking changes have high costs.

Key architectural decisions:
- **REST**: Resource-oriented. Best for CRUD-heavy, well-understood domains. Use when clients are diverse (browsers, mobile, third parties).
- **GraphQL**: Query-oriented. Best when clients need flexible data shapes. Use for complex frontends that aggregate data from multiple sources.
- **gRPC**: Procedure-oriented with Protocol Buffers. Best for service-to-service communication where performance and type safety matter.
- **Hybrid**: Many systems expose REST for public APIs and gRPC for internal service mesh communication.

## Key Conventions

- **URL design (REST)**: Use plural nouns for resources (`/users`, `/orders`). Nest for relationships (`/users/123/orders`). Use query parameters for filtering, sorting, pagination. Avoid verbs in URLs -- let HTTP methods convey the action.
- **HTTP methods**: GET (read, idempotent), POST (create), PUT (full replace, idempotent), PATCH (partial update), DELETE (remove, idempotent). Return appropriate status codes.
- **Status codes**: 200 (OK), 201 (Created), 204 (No Content), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 409 (Conflict), 422 (Unprocessable Entity), 429 (Too Many Requests), 500 (Internal Server Error), 503 (Service Unavailable).
- **Versioning**: Prefer URL path versioning (`/v1/users`) for simplicity. Header versioning (`Accept: application/vnd.api+json;version=1`) is more RESTful but harder to test. Never version with query parameters.
- **Error format**: Consistent JSON error responses with `error` (machine-readable code), `message` (human-readable), `details` (array of field-level errors), and `request_id` for tracing.
- **Pagination**: Use cursor-based pagination for large or frequently-changing datasets. Offset-based is acceptable for small, stable datasets. Always include `next` and `prev` links.
- **Rate limiting**: Return `429 Too Many Requests` with `Retry-After` header. Include rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`).

## Project Structure

```
src/
├── main.rs                  # Server startup, configuration loading
├── routes/                  # Route definitions grouped by resource
│   ├── mod.rs
│   ├── users.rs
│   ├── orders.rs
│   └── health.rs
├── handlers/                # Request handlers (controllers)
│   ├── users.rs
│   └── orders.rs
├── models/                  # Domain models and database entities
│   ├── user.rs
│   └── order.rs
├── services/                # Business logic layer
│   ├── user_service.rs
│   └── order_service.rs
├── repositories/            # Data access layer (DB queries)
│   ├── user_repo.rs
│   └── order_repo.rs
├── middleware/               # Auth, logging, rate limiting, CORS
├── errors.rs                # Error types and response formatting
├── config.rs                # Environment and config file loading
└── schema/                  # Database migrations, OpenAPI spec
    ├── migrations/
    └── openapi.yaml
tests/
├── integration/             # Full request/response cycle tests
├── fixtures/                # Seed data, factory functions
└── mocks/                   # External service mocks
```

## Agent Instructions

1. **Define the API contract first.** Write the OpenAPI spec or GraphQL schema before implementing handlers. Review it with consumers. The spec is the source of truth.
2. **Implement health checks immediately.** `GET /health` returns 200 when the service is ready. `GET /health/ready` checks downstream dependencies (database, cache, external services). These are required for deployment.
3. **Layer the architecture.** Route -> Handler -> Service -> Repository. Handlers parse requests and format responses. Services contain business logic. Repositories handle data access. No layer should skip another.
4. **Validate input at the boundary.** Parse and validate all request data in the handler layer. Use strong types. Reject invalid requests with 400/422 and descriptive error messages before they reach business logic.
5. **Add structured logging from the start.** Log request ID, method, path, status code, duration, and user ID on every request. Use JSON logging for production. Include correlation IDs for distributed tracing.
6. **Implement authentication and authorization early.** Even if only one auth method is needed initially, build the middleware to be extensible. Separate authentication (who are you?) from authorization (are you allowed?).
7. **Write integration tests for every endpoint.** Test happy path, validation errors, auth failures, not-found cases, and edge cases. Use a test database that is reset between test runs.
8. **Document every endpoint.** Keep the OpenAPI spec in sync with the implementation. Generate it from code annotations if possible. Include request/response examples.

## Testing Strategy

- **Unit tests**: Service layer logic, data transformations, authorization rules.
- **Integration tests**: Full HTTP request/response cycle against a test server with a real (test) database.
- **Contract tests**: Verify the API matches its OpenAPI/GraphQL spec. Use tools like Dredd or Spectral.
- **Load tests**: Measure response times and throughput under expected and peak load. Set performance budgets.
- **Security tests**: Test auth bypass, injection, rate limiting, and CORS. Use OWASP ZAP or similar.

## Common Pitfalls

- **Not versioning from day one**: Adding versioning later is painful. Start with `/v1/` even if you think you will never need v2.
- **Exposing internal IDs**: Use UUIDs or opaque identifiers in URLs. Sequential integer IDs leak information (total count, creation order) and enable enumeration attacks.
- **Inconsistent error responses**: Every error must use the same JSON structure. Clients should be able to parse errors programmatically without checking the status code first.
- **N+1 queries**: Loading a list of resources and then querying related data one-by-one. Use eager loading, joins, or DataLoader patterns.
- **Missing CORS configuration**: Browsers block cross-origin requests by default. Configure CORS for your known frontend origins. Do not use `Access-Control-Allow-Origin: *` in production with credentials.
- **Logging sensitive data**: Never log passwords, tokens, credit card numbers, or PII. Sanitize request/response logs. Mask sensitive headers.
- **No request timeouts**: Set timeouts on database queries, external API calls, and request processing. A single slow endpoint without a timeout can exhaust your thread/connection pool.
- **Ignoring idempotency**: POST endpoints that create resources should support idempotency keys to prevent duplicate creation from retried requests.
