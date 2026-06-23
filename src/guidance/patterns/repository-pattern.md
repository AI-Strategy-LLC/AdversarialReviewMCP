+++
display_name = "Repository Pattern"
applies_to = ["all"]
+++

# Repository Pattern

## When to Use

- Any application where you want to decouple domain logic from data access implementation details (SQL, NoSQL, file system, API calls).
- Projects that need to swap or evolve persistence mechanisms without rewriting business logic (e.g., migrating from SQL to a document store).
- Systems where domain logic must be unit-testable with in-memory fakes instead of requiring a running database.
- Codebases using Domain-Driven Design where aggregates need a clean persistence boundary.

## Key Principles

1. **Repository per Aggregate Root, Not per Table** -- A repository maps to a domain aggregate, not a database table. `OrderRepository` handles `Order` and its associated `OrderLineItem` and `OrderEvent` records as a single unit. Never create `OrderLineItemRepository`.
2. **Repository Interface Lives with the Domain** -- The interface/trait/protocol is defined alongside domain entities, not in the infrastructure layer. The concrete implementation (Postgres, Mongo, etc.) lives in infrastructure.
3. **Repositories Return Domain Objects** -- A repository takes in and returns domain entities, not database rows, ORM models, or DTOs. The mapping between persistence format and domain model is the repository's internal responsibility.
4. **Unit of Work Manages Transactions** -- If multiple repositories need to participate in a single transaction, use the Unit of Work pattern to coordinate commits and rollbacks. Individual repositories do not manage their own transactions.
5. **In-Memory Implementations for Testing** -- Every repository interface should have a trivial in-memory implementation that stores data in a list/map. This is the primary test double for unit tests.
6. **Keep the Interface Minimal** -- A repository interface should expose only the operations the domain actually needs: `find_by_id`, `save`, `delete`, and 2-3 domain-specific queries. Do not create a generic CRUD interface with 20 methods.

## Project Structure

```
src/
+-- domain/
|   +-- entities/
|   |   +-- order.{ext}             # Aggregate root
|   |   +-- order_line_item.{ext}   # Part of Order aggregate
|   |   +-- customer.{ext}          # Separate aggregate root
|   +-- repositories/               # Repository INTERFACES only
|   |   +-- order_repository.{ext}  # Interface/trait/protocol
|   |   +-- customer_repository.{ext}
|   +-- services/
|       +-- order_service.{ext}     # Uses repository interfaces
+-- infrastructure/
|   +-- persistence/
|   |   +-- postgres/
|   |   |   +-- postgres_order_repository.{ext}    # Concrete implementation
|   |   |   +-- postgres_customer_repository.{ext}
|   |   |   +-- models/                            # ORM/persistence models
|   |   |   |   +-- order_record.{ext}             # DB representation
|   |   |   |   +-- customer_record.{ext}
|   |   |   +-- mappers/
|   |   |       +-- order_mapper.{ext}             # Domain <-> DB mapping
|   |   +-- in_memory/
|   |       +-- in_memory_order_repository.{ext}   # Test implementation
|   |       +-- in_memory_customer_repository.{ext}
|   +-- unit_of_work.{ext}          # Transaction coordination
tests/
+-- unit/
|   +-- domain/
|       +-- order_service_test.{ext}  # Uses in-memory repos
+-- integration/
    +-- persistence/
        +-- postgres_order_repository_test.{ext}  # Tests against real DB
```

## Agent Instructions

### Defining a Repository Interface

Define the minimum operations needed. Start small and add methods only when the domain requires them.

```
interface OrderRepository:
    find_by_id(id: OrderId) -> Option<Order>
    save(order: Order) -> Result<void>
    delete(id: OrderId) -> Result<void>
    find_by_customer(customer_id: CustomerId) -> List<Order>
    find_pending_orders() -> List<Order>
```

Rules for the interface:
- Input and output types are domain types, never persistence types.
- Method names use domain language, not SQL language. Use `find_pending_orders()`, not `select_where_status_equals_pending()`.
- No method accepts raw SQL, filter objects, or query builders. Domain-specific queries are explicit methods.
- The interface does not expose pagination, sorting, or other infrastructure concerns unless they are genuine domain requirements.

### Implementing a Repository

1. Create the concrete class in `infrastructure/persistence/{technology}/`.
2. Implement the interface using the chosen persistence technology (ORM, raw SQL, document client).
3. Create mapper functions to convert between domain entities and persistence models.
4. Handle all persistence-specific errors internally. Map them to domain errors before returning.
5. Write integration tests that run against a real (or containerized) database.

### In-Memory Implementation for Testing

Every repository interface must have an in-memory implementation:

```
class InMemoryOrderRepository implements OrderRepository:
    private store: Map<OrderId, Order> = new Map()

    find_by_id(id):
        return store.get(id)

    save(order):
        store.set(order.id, deep_copy(order))

    delete(id):
        store.delete(id)

    find_by_customer(customer_id):
        return store.values().filter(o => o.customer_id == customer_id)
```

- Always deep-copy on save and return to prevent test state leakage.
- These in-memory implementations are used in all domain/use-case unit tests.

### Unit of Work

When a single business operation spans multiple aggregates:

```
class UnitOfWork:
    begin()
    commit()
    rollback()
    order_repository: OrderRepository
    customer_repository: CustomerRepository
```

The Unit of Work provides repository instances that share a single transaction context. The service layer calls `begin()`, performs operations through the repositories, then calls `commit()` or `rollback()`.

### Naming Conventions

- **Interfaces**: `{Aggregate}Repository` -- `OrderRepository`, `CustomerRepository`.
- **Implementations**: `{Technology}{Aggregate}Repository` -- `PostgresOrderRepository`, `MongoCustomerRepository`, `InMemoryOrderRepository`.
- **Persistence models**: `{Aggregate}Record` or `{Aggregate}Row` -- `OrderRecord`, `CustomerRow`.
- **Mappers**: `{Aggregate}Mapper` -- `OrderMapper.to_domain()`, `OrderMapper.to_record()`.

## Common Pitfalls

1. **Repository per Table** -- Creating `OrderRepository`, `OrderLineItemRepository`, `OrderEventRepository` separately. This fragments the aggregate and forces callers to manage consistency. The `OrderRepository` should handle the entire Order aggregate.
2. **Leaking ORM Types** -- Returning ActiveRecord models, Entity Framework entities, or Mongoose documents from the repository. These carry database session state and lazy-loading behavior that should not leak into domain code.
3. **Generic Repository Base Class** -- An abstract `Repository<T>` with `FindAll`, `FindById`, `Save`, `Delete` that every repository inherits from. This encourages per-table repositories and exposes operations the domain does not need. Define specific interfaces per aggregate.
4. **Query Logic in Services** -- If a service builds filter criteria and passes them to a generic repository query method, the repository is not doing its job. Domain-specific queries belong as explicit methods on the repository interface.
5. **No Integration Tests** -- Unit tests with in-memory repos validate business logic but not SQL correctness. Always write integration tests that verify the real repository implementation against an actual database.

## Platform-Specific Notes

### Java / Kotlin (Spring Data)

- Spring Data JPA generates implementations from interface method names. Use `@Repository` annotation.
- Separate JPA entities (`@Entity`) from domain entities. Map between them in the repository implementation.
- Use `@Transactional` on the service layer for Unit of Work semantics.
- Custom queries with `@Query` annotation when method name conventions are insufficient.

### C# / .NET (Entity Framework)

- Repository implementations wrap `DbContext`. The `DbContext` itself acts as the Unit of Work.
- Define repository interfaces in the domain layer. Implement them in an infrastructure project.
- Use `IQueryable` internally only -- never expose it through the repository interface.
- Register repositories in the DI container with scoped lifetime (one per request).

### Python (SQLAlchemy)

- Repository implementations use SQLAlchemy sessions. The session acts as the Unit of Work.
- Define repository interfaces as abstract classes (ABC) or Protocol types.
- Map between SQLAlchemy models and domain dataclasses in the repository.

### Rust

- Define repository traits in the domain crate. Implement them in an infrastructure crate.
- Use async traits (`async-trait` crate or native async traits) for database operations.
- `sqlx` for SQL, `mongodb` crate for MongoDB. Return domain types, not database row types.

### TypeScript

- Define repository interfaces as TypeScript interfaces. Implement with Prisma, TypeORM, or Knex.
- Avoid exposing Prisma client types through the interface. Map to plain TypeScript types.
- Use dependency injection (tsyringe, inversify) to wire implementations to interfaces.

### Swift

- Define repository protocols in the domain layer.
- Implementations use Core Data, SwiftData, or direct SQLite via GRDB.
- Keep NSManagedObject and SwiftData models in the infrastructure layer. Map to plain Swift structs for domain use.
