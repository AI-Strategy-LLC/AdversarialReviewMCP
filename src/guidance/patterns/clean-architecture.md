+++
display_name = "Clean Architecture"
applies_to = ["all"]
+++

# Clean Architecture

## When to Use

- Applications with complex domain logic where business rules must be testable independently of any framework, database, or UI.
- Long-lived projects where the persistence layer, UI framework, or external services are expected to change over the lifetime of the software.
- Systems where multiple delivery mechanisms (API, CLI, desktop, mobile) share the same business rules.
- Projects where the team needs strict dependency management to prevent inner layers from leaking infrastructure concerns.

## Key Principles

1. **The Dependency Rule** -- Source code dependencies always point inward. Inner circles know nothing about outer circles. Entities never import Use Cases. Use Cases never import Controllers or Gateways. This is the single most important rule.
2. **Entities are the core** -- Enterprise-wide business rules. Pure data structures with associated business logic. No framework annotations, no persistence decorators, no serialization concerns.
3. **Use Cases orchestrate** -- Application-specific business rules. Each use case is a single operation the system performs (e.g., `PlaceOrder`, `TransferFunds`). A use case takes input, calls entities, and produces output through a defined boundary.
4. **Interface Adapters translate** -- Controllers, Presenters, Gateways. They convert data from the format convenient for use cases to the format required by external systems (and vice versa).
5. **Frameworks are details** -- The database, web framework, ORM, and third-party libraries live in the outermost ring. They are plug-in replaceable.
6. **Cross boundaries with interfaces** -- When an inner layer needs something from an outer layer (e.g., a use case needs to save data), it defines an interface (port). The outer layer provides the implementation (adapter). Dependency Inversion at every boundary.

## Project Structure

```
src/
+-- domain/                         # Inner ring: Entities
|   +-- entities/
|   |   +-- user.{ext}             # Pure business objects
|   |   +-- order.{ext}
|   +-- value_objects/
|   |   +-- money.{ext}
|   |   +-- email_address.{ext}
|   +-- errors/
|       +-- domain_errors.{ext}
+-- use_cases/                      # Second ring: Application business rules
|   +-- place_order.{ext}          # One file per use case
|   +-- cancel_order.{ext}
|   +-- get_user_profile.{ext}
|   +-- ports/                     # Interfaces that use cases depend on
|       +-- order_repository.{ext} # Abstract interface
|       +-- payment_gateway.{ext}
|       +-- notification_service.{ext}
+-- adapters/                       # Third ring: Interface Adapters
|   +-- controllers/
|   |   +-- order_controller.{ext}
|   |   +-- user_controller.{ext}
|   +-- presenters/
|   |   +-- order_presenter.{ext}
|   +-- gateways/
|       +-- postgres_order_repository.{ext}  # Implements OrderRepository
|       +-- stripe_payment_gateway.{ext}     # Implements PaymentGateway
|       +-- email_notification_service.{ext}
+-- infrastructure/                 # Outermost ring: Frameworks & Drivers
|   +-- web/
|   |   +-- server.{ext}           # HTTP server setup
|   |   +-- routes.{ext}
|   |   +-- middleware/
|   +-- database/
|   |   +-- connection.{ext}
|   |   +-- migrations/
|   +-- config/
|       +-- app_config.{ext}
tests/
+-- unit/
|   +-- domain/                    # Test entities in isolation
|   +-- use_cases/                 # Test use cases with mock ports
+-- integration/
|   +-- gateways/                  # Test adapters against real infrastructure
+-- e2e/
```

## Agent Instructions

### Creating a New Feature

1. **Start with the use case** -- Write the use case class/function first. Define its input DTO, output DTO, and the port interfaces it needs.
2. **Implement entities if needed** -- If the use case requires new domain concepts, create entity and value object files in `domain/`.
3. **Define ports** -- Create interfaces in `use_cases/ports/` for any external dependency the use case needs.
4. **Write use case tests** -- Test the use case with in-memory/mock implementations of its ports. These tests must run without a database, network, or framework.
5. **Implement adapters** -- Create concrete implementations of the port interfaces in `adapters/gateways/`.
6. **Create the controller** -- Build the HTTP/CLI/UI controller in `adapters/controllers/` that calls the use case.
7. **Wire everything together** -- In `infrastructure/`, configure dependency injection to connect implementations to interfaces.

### Naming Conventions

- **Use cases**: Verb phrase describing the action -- `PlaceOrder`, `GetUserProfile`, `CancelSubscription`.
- **Ports**: Interface named after the capability -- `OrderRepository`, `PaymentGateway`, `NotificationService`.
- **Adapters**: Prefixed with the technology -- `PostgresOrderRepository`, `StripePaymentGateway`, `SmtpNotificationService`.
- **DTOs**: Suffixed with `Request`/`Response` or `Input`/`Output` -- `PlaceOrderRequest`, `PlaceOrderResponse`.

### Dependency Direction Enforcement

- The `domain/` directory must have zero imports from `use_cases/`, `adapters/`, or `infrastructure/`.
- The `use_cases/` directory must have zero imports from `adapters/` or `infrastructure/`.
- The `adapters/` directory may import from `use_cases/` (to implement ports) but never from `infrastructure/`.
- Use your language's module system, linting rules, or architecture test tools (ArchUnit, dependency-cruiser) to enforce this.

### Use Case Structure

Every use case should follow this pattern:

```
class PlaceOrder:
    constructor(orderRepo: OrderRepository, paymentGw: PaymentGateway)

    execute(input: PlaceOrderInput) -> PlaceOrderOutput:
        1. Validate input
        2. Create/load domain entities
        3. Execute business logic on entities
        4. Persist via repository port
        5. Trigger side effects via other ports
        6. Return output DTO
```

## Common Pitfalls

1. **Skipping the use case layer** -- Controllers calling repositories directly collapses the architecture into two layers and loses the ability to test business logic independently.
2. **Entities with framework annotations** -- `@Entity`, `@Table`, `@JsonProperty` on domain entities couples your core to infrastructure. Use separate persistence models in the adapter layer and map between them.
3. **Leaking infrastructure types inward** -- Passing an `HttpRequest`, `DbConnection`, or framework-specific error type into a use case. Always map to domain-specific types at the boundary.
4. **One repository per table** -- Repositories correspond to aggregate roots, not database tables. An `OrderRepository` may write to `orders`, `order_items`, and `order_events` tables.
5. **Over-engineering simple CRUD** -- If a feature is pure CRUD with no business logic, Clean Architecture adds overhead. Use it where domain complexity justifies the layers.

## Platform-Specific Notes

### Java / Kotlin (Spring)

- Use Java packages to enforce layer boundaries: `com.app.domain`, `com.app.usecases`, `com.app.adapters`, `com.app.infrastructure`.
- Spring annotations (`@Service`, `@Repository`, `@Controller`) live only in the adapter and infrastructure layers.
- Domain entities are plain Java/Kotlin classes -- no JPA annotations. Create separate JPA entity classes in the adapter layer.
- Use ArchUnit tests to verify the dependency rule at build time.

### TypeScript / Node.js

- Use project references or path aliases to enforce import boundaries between layers.
- Interfaces in `use_cases/ports/` are TypeScript interfaces. Adapters implement them as classes.
- Consider using `eslint-plugin-import` with restricted import rules per directory.

### Rust

- Each layer can be a separate crate within a workspace: `domain`, `use_cases`, `adapters`, `infrastructure`.
- Cargo's dependency graph naturally enforces the dependency rule -- inner crates simply do not list outer crates in `Cargo.toml`.
- Use traits in `use_cases` for port definitions. Adapter crates implement those traits.

### Swift / iOS

- Use Swift packages or framework targets to enforce boundaries.
- The `domain` package has no dependencies. The `use_cases` package depends only on `domain`.
- Combine or async/await for asynchronous use case execution.
- SwiftUI views and UIKit controllers live in the outermost layer.

### Python

- Use a package-per-layer structure. Consider `import-linter` to enforce dependency rules.
- Abstract base classes (ABC) or Protocol types define ports.
- Adapters implement ports as concrete classes.
