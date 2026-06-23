+++
display_name = "Monolith"
applies_to = ["all"]
+++

# Well-Structured Monolith

## When to Use

- Most projects, especially in early stages. A monolith is the correct default architecture for the majority of applications. It is not a pejorative.
- Small-to-medium teams (1-15 developers) where the overhead of distributed systems outweighs the benefits.
- Products where domain boundaries are still evolving and premature service extraction would create churn.
- Applications where transactional consistency across modules is important and eventual consistency adds unnecessary complexity.

## Key Principles

1. **Modular Monolith, Not Big Ball of Mud** -- The value of a monolith depends entirely on internal structure. A monolith with clear module boundaries, internal APIs, and enforced dependency rules is far superior to a distributed monolith disguised as microservices.
2. **Module Boundaries are Hard Walls** -- Each module owns its data, exposes a public API (interface), and hides its implementation. Cross-module database queries are forbidden. Modules communicate through their public interfaces.
3. **One Deployment Unit, Many Modules** -- The application deploys as a single artifact, but internally it is composed of well-defined modules that could theoretically be extracted into services later.
4. **Shared Kernel is Minimal** -- Common types, utilities, and cross-cutting concerns live in a small shared kernel. If the shared kernel grows large, modules are too coupled.
5. **Database Schema Partitioning** -- Each module owns its database tables. Use table prefixes or schemas (e.g., `orders_*`, `users_*`) to make ownership visible. Cross-module joins go through the module's public API, not SQL.
6. **Test Modules in Isolation** -- Each module should have unit tests that run without other modules loaded. Integration tests verify cross-module interactions through public APIs.

## Project Structure

```
src/
+-- modules/
|   +-- users/
|   |   +-- api.{ext}              # Public module interface (exported functions/classes)
|   |   +-- internal/
|   |   |   +-- models.{ext}       # Domain models (not exported)
|   |   |   +-- repository.{ext}   # Data access (not exported)
|   |   |   +-- service.{ext}      # Business logic (not exported)
|   |   +-- tests/
|   |       +-- unit/
|   |       +-- integration/
|   +-- orders/
|   |   +-- api.{ext}
|   |   +-- internal/
|   |   |   +-- models.{ext}
|   |   |   +-- repository.{ext}
|   |   |   +-- service.{ext}
|   |   |   +-- events.{ext}       # Module-level domain events
|   |   +-- tests/
|   +-- billing/
|   |   +-- api.{ext}
|   |   +-- internal/
|   |   +-- tests/
|   +-- notifications/
|       +-- api.{ext}
|       +-- internal/
|       +-- tests/
+-- shared/
|   +-- kernel/                     # Shared types, base classes
|   |   +-- entity.{ext}
|   |   +-- value_object.{ext}
|   |   +-- result.{ext}
|   +-- infrastructure/             # Cross-cutting: logging, config, auth
|       +-- logging.{ext}
|       +-- database.{ext}
|       +-- auth.{ext}
+-- web/                            # Delivery mechanism (HTTP, CLI, etc.)
|   +-- routes.{ext}
|   +-- middleware/
|   +-- controllers/               # Thin -- delegates to module APIs
+-- main.{ext}                      # Application entry point and DI wiring
db/
+-- migrations/
+-- seeds/
tests/
+-- e2e/                            # Full-stack integration tests
```

## Agent Instructions

### Creating a New Module

1. **Create the module directory** with `api.{ext}` and `internal/` subdirectory.
2. **Define the public API first** -- What operations does this module expose? Write the interface in `api.{ext}`. Only types and functions in `api.{ext}` are accessible to other modules.
3. **Implement internals** -- Models, repositories, and services go in `internal/`. These are private to the module.
4. **Write unit tests** for the module in isolation. Mock any cross-module dependencies.
5. **Register the module** in the application's dependency injection container or module registry.

### Module Communication Rules

- Modules call each other only through their `api.{ext}` public interface.
- No module may import another module's `internal/` files.
- For asynchronous communication within the monolith, use an internal event bus. Modules publish domain events; other modules subscribe.
- If Module A needs data owned by Module B, Module A calls Module B's API. Module A does not query Module B's database tables.

### Database Ownership

- Each module defines its own migrations in a module-scoped directory or with a module prefix.
- Table naming convention: `{module}_{table}` -- e.g., `users_accounts`, `orders_line_items`.
- No cross-module foreign keys at the database level. Use application-level references (store IDs, not joins).

### When to Extract a Service

A module is a candidate for extraction into a separate service when:
- It has a fundamentally different scaling profile (e.g., image processing vs. CRUD).
- A separate team will own it with an independent release cadence.
- It has zero synchronous dependencies on other modules (only event-based communication).
- The module's public API is stable and well-tested.

Do not extract a service just because a module is "big." Size alone is not a reason.

### Naming Conventions

- **Module directories**: Lowercase plural nouns -- `users`, `orders`, `billing`.
- **Public API file**: `api.{ext}` or `public.{ext}` -- a single entry point.
- **Internal files**: Descriptive names -- `service.{ext}`, `repository.{ext}`, `models.{ext}`.
- **Database tables**: `{module}_{entity_plural}` -- `orders_line_items`, `users_sessions`.

## Common Pitfalls

1. **No internal boundaries** -- A monolith without module boundaries degrades into a tangle of cross-cutting dependencies. Enforce boundaries from day one with import rules or linting.
2. **Cross-module database access** -- The moment one module queries another module's tables, you have coupled their internal schemas. This makes future extraction impossible and refactoring dangerous.
3. **God module** -- One module that every other module depends on. Keep the shared kernel minimal. If a concept is truly shared, it belongs in `shared/kernel/`. If it belongs to a domain, it belongs in that module.
4. **Premature extraction** -- Extracting a service "just in case" before the module boundary is stable creates a distributed monolith with network overhead and no benefit.
5. **Ignoring internal API design** -- Module APIs deserve the same care as external APIs. Version them, document them, and resist breaking changes.

## Platform-Specific Notes

### Ruby on Rails

- Use Rails engines for module boundaries. Each engine has its own models, controllers, and migrations.
- Use `isolate_namespace` to prevent constant leakage between engines.
- The main app acts as the composition root, wiring engines together.

### Django (Python)

- Each module is a Django app. Use `apps.py` configuration to set the app label prefix.
- Enforce import boundaries with `import-linter` or custom linting rules.
- Use Django's signal framework for inter-module events.

### Java / Kotlin (Spring Boot)

- Use Java packages with `package-private` visibility for internal classes. Only the `api` package contains public classes.
- Use ArchUnit to enforce that no module imports another module's internal package.
- Consider Spring Modulith for explicit module boundaries and module interaction recording.

### Go

- Each module is a Go package. The `internal/` directory in Go already enforces visibility.
- The module's root package exposes public types and functions. Subpackages under `internal/` are inaccessible from outside.

### Rust

- Each module can be a library crate in the workspace. Use `pub` vs `pub(crate)` to control visibility.
- The module's `lib.rs` re-exports only the public API. Internal types stay in private modules.

### TypeScript / Node.js

- Each module is a directory with an `index.ts` barrel file as the public API.
- Use ESLint `no-restricted-imports` to prevent cross-module internal imports.
- Consider using TypeScript project references for build-time boundary enforcement.
