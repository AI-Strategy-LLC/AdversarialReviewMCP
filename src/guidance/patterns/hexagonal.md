+++
display_name = "Hexagonal Architecture"
applies_to = ["all"]
+++

# Hexagonal Architecture (Ports and Adapters)

## When to Use

- Applications where the core domain must be completely independent of delivery mechanisms (HTTP, CLI, message queues) and infrastructure (databases, external APIs, file systems).
- Projects where you need to test business logic without any infrastructure running -- no database, no web server, no message broker.
- Systems that must support multiple entry points (REST API and CLI and event consumer) all executing the same business logic.
- Long-lived codebases where infrastructure dependencies (database vendor, cloud provider, framework) are expected to change.

## Key Principles

1. **The Application is a Hexagon** -- At the center is your domain logic. The hexagon's edges are ports (interfaces). Outside the hexagon are adapters that connect the real world to those ports. The domain never reaches outward; the outside world reaches inward through ports.
2. **Primary (Driving) Ports** -- These are the entry points into your application. They define what the application can do. An HTTP controller, a CLI command handler, or a message consumer calls a primary port. Primary ports are interfaces that the application implements.
3. **Secondary (Driven) Ports** -- These are the dependencies your application needs from the outside world. Database access, sending emails, calling external APIs. Secondary ports are interfaces that the application defines but external adapters implement.
4. **Adapters are Interchangeable** -- A PostgreSQL adapter and a MongoDB adapter both implement the same secondary port. A REST adapter and a GraphQL adapter both call the same primary port. Swapping an adapter requires zero changes to the domain.
5. **The Domain Has Zero Infrastructure Imports** -- The core domain package/module does not import database drivers, HTTP frameworks, serialization libraries, or any external dependency. It imports only language standard libraries and its own types.
6. **Dependency Injection Wires Everything** -- The composition root (main function or DI container) creates concrete adapters and injects them into the application through port interfaces. The domain code never instantiates its own dependencies.

## Project Structure

```
src/
+-- domain/                         # The hexagon interior
|   +-- model/
|   |   +-- order.{ext}            # Domain entities and value objects
|   |   +-- customer.{ext}
|   |   +-- money.{ext}
|   +-- services/
|   |   +-- order_service.{ext}    # Domain services (business logic)
|   |   +-- pricing_service.{ext}
|   +-- errors.{ext}               # Domain-specific error types
+-- ports/
|   +-- inbound/                    # Primary / Driving ports
|   |   +-- place_order_port.{ext}      # Interface: what can be done
|   |   +-- query_orders_port.{ext}
|   |   +-- manage_customers_port.{ext}
|   +-- outbound/                   # Secondary / Driven ports
|       +-- order_repository_port.{ext}     # Interface: what is needed
|       +-- payment_gateway_port.{ext}
|       +-- notification_port.{ext}
|       +-- inventory_port.{ext}
+-- application/                    # Port implementations (use case orchestration)
|   +-- place_order_service.{ext}       # Implements PlaceOrderPort
|   +-- query_orders_service.{ext}      # Implements QueryOrdersPort
+-- adapters/
|   +-- inbound/                    # Driving adapters (entry points)
|   |   +-- rest/
|   |   |   +-- order_controller.{ext}
|   |   |   +-- customer_controller.{ext}
|   |   |   +-- dto/
|   |   |       +-- create_order_request.{ext}
|   |   |       +-- order_response.{ext}
|   |   +-- cli/
|   |   |   +-- order_commands.{ext}
|   |   +-- grpc/
|   |   |   +-- order_grpc_service.{ext}
|   |   +-- events/
|   |       +-- order_event_consumer.{ext}
|   +-- outbound/                   # Driven adapters (infrastructure)
|       +-- persistence/
|       |   +-- postgres_order_repository.{ext}
|       |   +-- models/             # ORM/persistence-specific models
|       |   +-- mappers/            # Domain <-> persistence mapping
|       +-- payment/
|       |   +-- stripe_payment_gateway.{ext}
|       +-- notification/
|       |   +-- email_notification_adapter.{ext}
|       |   +-- sms_notification_adapter.{ext}
|       +-- inventory/
|           +-- warehouse_api_client.{ext}
+-- configuration/                  # Composition root
|   +-- main.{ext}                  # Wires adapters to ports
|   +-- dependency_injection.{ext}
tests/
+-- unit/
|   +-- domain/                     # Pure domain logic tests
|   +-- application/                # Use case tests with fake adapters
+-- integration/
|   +-- adapters/                   # Real adapter tests
+-- acceptance/
    +-- features/                   # End-to-end through primary ports
```

## Agent Instructions

### Defining Ports

**Inbound ports** represent operations the outside world can trigger:

```
interface PlaceOrderPort:
    place_order(customer_id, items, shipping) -> OrderId

interface QueryOrdersPort:
    get_order(order_id) -> OrderDetail
    list_orders(customer_id, filters) -> List<OrderSummary>
```

**Outbound ports** represent capabilities the application needs:

```
interface OrderRepositoryPort:
    save(order: Order) -> void
    find_by_id(id: OrderId) -> Option<Order>

interface PaymentGatewayPort:
    charge(amount: Money, payment_method: PaymentMethod) -> PaymentResult

interface NotificationPort:
    send(recipient: str, message: str) -> void
```

### Implementing the Application Layer

The application layer implements inbound ports and uses outbound ports:

```
class PlaceOrderService implements PlaceOrderPort:
    constructor(
        order_repo: OrderRepositoryPort,
        payment: PaymentGatewayPort,
        notification: NotificationPort
    )

    place_order(customer_id, items, shipping) -> OrderId:
        order = Order.create(customer_id, items, shipping)  # Domain model
        payment_result = payment.charge(order.total, ...)    # Outbound port
        order.confirm_payment(payment_result)                # Domain logic
        order_repo.save(order)                               # Outbound port
        notification.send(customer_id, "Order confirmed")    # Outbound port
        return order.id
```

### Creating an Inbound Adapter

An inbound adapter translates external requests into port calls:

```
class OrderController:                       # REST adapter
    constructor(place_order: PlaceOrderPort)

    POST /orders (request):
        # 1. Deserialize HTTP request to domain types
        # 2. Call the inbound port
        # 3. Serialize the result to HTTP response
        order_id = place_order.place_order(
            request.customer_id,
            map_items(request.items),
            map_address(request.shipping)
        )
        return 201, { order_id: order_id }
```

### Creating an Outbound Adapter

An outbound adapter implements a port using real infrastructure:

```
class PostgresOrderRepository implements OrderRepositoryPort:
    constructor(db_connection)

    save(order):
        record = OrderMapper.to_record(order)    # Map domain -> persistence
        db.insert("orders", record)

    find_by_id(id):
        record = db.query("SELECT * FROM orders WHERE id = ?", id)
        return OrderMapper.to_domain(record)     # Map persistence -> domain
```

### Testing Strategy

- **Domain tests**: Test domain model methods with plain unit tests. No mocks, no infrastructure.
- **Application tests**: Test use case services with fake/stub outbound adapters. Verify business logic orchestration.
- **Adapter tests**: Test each adapter in isolation against real infrastructure (containerized DB, mock HTTP server).
- **Acceptance tests**: Test through inbound adapters with real outbound adapters against test infrastructure.

### Naming Conventions

- **Inbound ports**: `{Action}Port` or `{Capability}Port` -- `PlaceOrderPort`, `QueryOrdersPort`.
- **Outbound ports**: `{Capability}Port` -- `OrderRepositoryPort`, `PaymentGatewayPort`, `NotificationPort`.
- **Application services**: `{Action}Service` -- `PlaceOrderService`, `QueryOrdersService`.
- **Inbound adapters**: `{Entity}Controller`, `{Entity}CliCommand`, `{Entity}GrpcService`.
- **Outbound adapters**: `{Technology}{Port}` -- `PostgresOrderRepository`, `StripePaymentGateway`.

## Common Pitfalls

1. **Domain imports infrastructure** -- The moment `domain/order.{ext}` imports a database driver, ORM decorator, or HTTP library, the hexagonal boundary is broken. The domain must have zero infrastructure dependencies.
2. **Ports too granular or too broad** -- A port with one method per entity operation (`SaveOrder`, `FindOrder`, `DeleteOrder` as separate ports) is too granular. A port with 30 methods is too broad. Group related operations into cohesive ports.
3. **Adapters contain business logic** -- If a REST controller validates business rules, calculates prices, or checks authorization logic, that belongs in the domain or application layer. Adapters only translate between external formats and port calls.
4. **Skipping the application layer** -- Inbound adapters calling domain objects directly (bypassing ports and use case services) couples the adapter to domain internals. Always go through a port.
5. **Mapping fatigue** -- The multiple mapping layers (HTTP DTO -> domain type -> persistence model) feel like boilerplate. They are the mechanism that provides decoupling. Do not shortcut them by passing DTOs into the domain.

## Platform-Specific Notes

### Java / Kotlin

- Use Java packages to enforce boundaries: `com.app.domain`, `com.app.ports.inbound`, `com.app.ports.outbound`, `com.app.adapters.inbound.rest`, `com.app.adapters.outbound.persistence`.
- Spring annotations (`@RestController`, `@Repository`, `@Service`) live only in adapter and configuration packages.
- Use ArchUnit to verify the domain package has no imports from adapter or infrastructure packages.

### Rust

- Excellent natural fit. Each hexagonal layer is a crate in the workspace.
- `domain` crate: zero external dependencies. Only `std`.
- `ports` crate: depends on `domain`. Defines traits.
- `application` crate: depends on `domain` + `ports`. Implements inbound traits, uses outbound traits.
- `adapters` crate: depends on everything. Implements outbound traits with real libraries.
- Cargo dependency graph enforces the architecture at compile time.

### TypeScript

- Use barrel exports (`index.ts`) to control what each layer exposes.
- Define ports as TypeScript interfaces. Adapters are classes implementing those interfaces.
- Use path aliases in `tsconfig.json` to make imports clean: `@domain/`, `@ports/`, `@adapters/`.
- Enforce boundaries with ESLint `no-restricted-imports`.

### Python

- Define ports as abstract base classes (ABC) or `Protocol` types.
- Use a dependency injection library (dependency-injector, inject) for wiring.
- Enforce boundaries with `import-linter`.

### Go

- Ports are interfaces defined in the domain or ports package.
- Adapters are structs in separate packages that implement those interfaces.
- Go's `internal/` package convention can enforce visibility boundaries.
- Wire everything in `main.go` or a `wire` package.
