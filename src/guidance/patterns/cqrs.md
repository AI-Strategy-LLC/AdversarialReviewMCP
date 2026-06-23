+++
display_name = "CQRS"
applies_to = ["all"]
+++

# Command Query Responsibility Segregation (CQRS)

## When to Use

- Systems where read and write workloads have fundamentally different performance characteristics or scaling requirements (many reads, few writes -- or vice versa).
- Applications with complex domain logic for writes but simple, denormalized views for reads (dashboards, reporting, search).
- When combined with Event Sourcing, where the write model is an event stream and read models are projections built from those events.
- Multi-model persistence: the write side uses a normalized relational database while the read side uses Elasticsearch, Redis, or a materialized view.

**When this is overkill**: Simple CRUD applications where reads and writes use the same data shape. Applications with fewer than a handful of entities. Projects where eventual consistency between read and write models adds complexity without meaningful benefit.

## Key Principles

1. **Separate the Write Model from the Read Model** -- Commands modify state through a write model optimized for consistency and business rules. Queries return data from a read model optimized for the specific query pattern. These are distinct code paths, and potentially distinct data stores.
2. **Commands Do Not Return Data** -- A command handler performs a mutation and returns success/failure (or the ID of the created entity). It does not return the full entity. If the caller needs data after a command, it issues a separate query.
3. **Queries Do Not Mutate State** -- A query handler retrieves data and returns it. It has no side effects. This makes queries safe to cache, retry, and scale independently.
4. **Read Models are Disposable** -- Since read models are derived from the write model (or event stream), they can be rebuilt from scratch at any time. This means you can freely add, modify, or replace read models without touching the write side.
5. **Eventual Consistency Between Models** -- When read and write models are separate stores, the read model may lag behind the write model. Design the UI to accommodate this (optimistic updates, "your action is being processed" patterns).
6. **One Read Model per View** -- Instead of a general-purpose query API, build purpose-specific read models. An order list view, an order detail view, and a revenue dashboard each get their own read model optimized for that exact query.

## Project Structure

```
src/
+-- write/                          # Command side
|   +-- commands/
|   |   +-- place_order.{ext}       # Command definition (data)
|   |   +-- cancel_order.{ext}
|   |   +-- update_shipping.{ext}
|   +-- command_handlers/
|   |   +-- place_order_handler.{ext}   # Business logic for write
|   |   +-- cancel_order_handler.{ext}
|   +-- domain/
|   |   +-- order.{ext}             # Write-side domain model (rich)
|   |   +-- order_repository.{ext}  # Write repository interface
|   +-- events/                     # Domain events produced by commands
|       +-- order_placed.{ext}
|       +-- order_cancelled.{ext}
+-- read/                           # Query side
|   +-- queries/
|   |   +-- get_order_detail.{ext}  # Query definition (data)
|   |   +-- list_orders.{ext}
|   |   +-- get_revenue_summary.{ext}
|   +-- query_handlers/
|   |   +-- get_order_detail_handler.{ext}
|   |   +-- list_orders_handler.{ext}
|   |   +-- get_revenue_summary_handler.{ext}
|   +-- read_models/
|   |   +-- order_detail_view.{ext}     # Flat, denormalized read model
|   |   +-- order_list_item.{ext}
|   |   +-- revenue_summary.{ext}
|   +-- projections/                # Build read models from events
|       +-- order_detail_projection.{ext}
|       +-- order_list_projection.{ext}
|       +-- revenue_projection.{ext}
+-- infrastructure/
|   +-- persistence/
|   |   +-- write_db/               # Normalized relational store
|   |   +-- read_db/                # Denormalized read store
|   +-- messaging/
|       +-- event_publisher.{ext}
|       +-- projection_consumer.{ext}
+-- api/
|   +-- command_endpoints.{ext}     # POST/PUT/DELETE -> commands
|   +-- query_endpoints.{ext}       # GET -> queries
tests/
+-- write/
|   +-- command_handlers/
+-- read/
|   +-- query_handlers/
|   +-- projections/
```

## Agent Instructions

### Defining Commands and Queries

Commands and queries are plain data objects (DTOs) with no behavior:

```
# Command: imperative verb phrase
class PlaceOrder:
    customer_id: str
    items: List[OrderItem]
    shipping_address: Address

# Query: question or retrieval phrase
class GetOrderDetail:
    order_id: str

class ListOrders:
    customer_id: str
    page: int
    page_size: int
```

### Command Handler Pattern

Every command handler follows this structure:

```
class PlaceOrderHandler:
    constructor(order_repo, event_publisher)

    handle(command: PlaceOrder) -> Result<OrderId>:
        1. Validate command data
        2. Load or create domain aggregate
        3. Execute business logic on the aggregate
        4. Save the aggregate via repository
        5. Publish domain events
        6. Return success with created ID (or void)
```

- One handler per command. No handler handles multiple commands.
- The handler orchestrates; the domain model contains the business rules.
- Commands are validated here, not in the API layer.

### Query Handler Pattern

```
class GetOrderDetailHandler:
    constructor(read_store)

    handle(query: GetOrderDetail) -> OrderDetailView:
        1. Query the read store directly
        2. Return the read model (or throw NotFound)
```

- Query handlers are simple. No business logic, no domain model interaction.
- They read from the denormalized read store and return the data as-is.
- If the read model does not exist for a given query, create a new projection.

### Building Projections

Projections transform events into read models:

```
class OrderDetailProjection:
    on(OrderPlaced event):
        insert into read_store: {
            order_id: event.order_id,
            customer_name: event.customer_name,
            status: "placed",
            total: event.total,
            items: event.items
        }

    on(OrderShipped event):
        update read_store where order_id = event.order_id:
            set status = "shipped", tracking_number = event.tracking
```

- One projection per read model.
- Projections are idempotent: replaying events produces the same read model.
- Store a checkpoint/offset per projection so it can resume after restart.

### API Design

- Command endpoints use `POST`, `PUT`, or `DELETE`. They accept a command body and return `202 Accepted` (async) or `201 Created` / `200 OK` (sync).
- Query endpoints use `GET`. They accept query parameters and return the read model.
- Never mix commands and queries in a single endpoint.

### Naming Conventions

- **Commands**: `{Verb}{Entity}` -- `PlaceOrder`, `CancelOrder`, `UpdateShippingAddress`.
- **Queries**: `Get{Entity}Detail`, `List{Entities}`, `Search{Entities}` -- `GetOrderDetail`, `ListOrders`.
- **Read models**: `{Entity}{ViewType}` -- `OrderDetailView`, `OrderListItem`, `RevenueSummary`.
- **Projections**: `{ReadModel}Projection` -- `OrderDetailProjection`, `RevenueProjection`.
- **Handlers**: `{CommandOrQuery}Handler` -- `PlaceOrderHandler`, `GetOrderDetailHandler`.

## Common Pitfalls

1. **Applying CQRS Everywhere** -- Not every module needs CQRS. Use it where read/write asymmetry exists. CRUD-heavy modules with simple reads should use a standard repository.
2. **Commands That Return Full Entities** -- A command handler that returns the complete updated entity has effectively merged the command and query paths. Return only the ID or a minimal acknowledgment.
3. **Stale Read Model Confusion** -- Users issue a command, then immediately query and see old data. Handle this with optimistic updates in the UI, or return the command's event so the frontend can update locally before the projection catches up.
4. **Projection Not Idempotent** -- If replaying events creates duplicate records in the read store, the projection has a bug. Always use upsert semantics or check for existing records.
5. **Single Read Model for All Queries** -- Building one giant denormalized view that serves all query needs defeats the purpose. Each query gets a purpose-built read model.

## Platform-Specific Notes

### .NET (MediatR)

- Use MediatR for command/query dispatching. Define `IRequest<T>` for commands with return values, `IRequest` for commands without. Use `IRequest<T>` with a read model type for queries.
- Separate command and query handlers into distinct classes implementing `IRequestHandler<TRequest, TResponse>`.
- Use Entity Framework for the write side, Dapper or raw SQL for read-side queries.

### Java / Kotlin (Axon Framework)

- Axon provides built-in CQRS + Event Sourcing support. Annotate command handlers with `@CommandHandler`, event handlers with `@EventHandler`, query handlers with `@QueryHandler`.
- Use the Axon Server for event store and message routing, or configure JDBC/JPA stores.

### TypeScript

- Use a command bus / query bus pattern. Libraries like `nestjs-cqrs` or hand-rolled dispatchers.
- Write-side: Prisma or TypeORM with normalized schema. Read-side: raw SQL queries or Elasticsearch.
- Define command and query types as TypeScript interfaces or classes.

### Rust

- Define command and query types as structs. Handlers are functions or trait implementations.
- Use an enum-based dispatch or a trait-based handler registry.
- Write-side: `sqlx` with transactions. Read-side: denormalized tables queried with `sqlx`.

### Event Sourcing Integration

When combining CQRS with Event Sourcing:
- The write-side repository saves events, not entity state.
- Aggregates are rebuilt by replaying events.
- Projections consume the event stream to build read models.
- Snapshots optimize aggregate loading for long event histories.
- The event store and read stores are separate databases.
