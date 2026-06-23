+++
display_name = "Layered Architecture"
applies_to = ["all"]
+++

# Layered Architecture

## When to Use

- CRUD-heavy applications where the primary operations are creating, reading, updating, and deleting records with straightforward business rules.
- Projects where the team benefits from a simple, well-understood structure that new developers can navigate immediately.
- Applications with moderate complexity that do not warrant the overhead of Clean Architecture or Hexagonal patterns.
- Enterprise applications following traditional n-tier patterns where the separation of presentation, business logic, and data access provides sufficient modularity.

## Key Principles

1. **Strict Layering** -- Each layer only communicates with the layer directly below it. The Presentation layer calls Business Logic, which calls Data Access, which calls the Database. No layer skips levels. The Presentation layer never calls Data Access directly.
2. **Dependencies Flow Downward** -- Upper layers depend on lower layers, never the reverse. The Data Access layer does not import from the Business Logic layer. The Business Logic layer does not import from the Presentation layer.
3. **Each Layer Has a Single Responsibility** -- Presentation handles HTTP/UI concerns. Business Logic contains domain rules and orchestration. Data Access handles persistence. Mixing responsibilities across layers is the most common violation.
4. **Layers Communicate Through Defined Interfaces** -- Even in a simple layered architecture, layers should communicate through interfaces or function signatures, not by directly instantiating concrete classes from the layer below.
5. **Cross-Cutting Concerns Are Handled Separately** -- Logging, authentication, error handling, and configuration do not belong to any single layer. Handle them with middleware, decorators, or a shared infrastructure module.
6. **Keep Layers Thin** -- No single layer should contain the majority of the code. If the Business Logic layer is trivially thin (just pass-through calls), the application may not need this pattern. If the Data Access layer contains business rules, they need to be moved up.

## Project Structure

```
src/
+-- presentation/                   # Layer 1: User Interface / API
|   +-- controllers/
|   |   +-- user_controller.{ext}
|   |   +-- order_controller.{ext}
|   +-- middleware/
|   |   +-- auth_middleware.{ext}
|   |   +-- error_handler.{ext}
|   +-- dto/
|   |   +-- create_user_request.{ext}
|   |   +-- user_response.{ext}
|   |   +-- order_response.{ext}
|   +-- validators/
|       +-- user_validators.{ext}
+-- business/                       # Layer 2: Business Logic / Service
|   +-- services/
|   |   +-- user_service.{ext}
|   |   +-- order_service.{ext}
|   +-- models/                     # Domain models with business rules
|   |   +-- user.{ext}
|   |   +-- order.{ext}
|   +-- interfaces/                 # Contracts for the layer below
|       +-- user_repository.{ext}   # Interface
|       +-- order_repository.{ext}
+-- data_access/                    # Layer 3: Data Access / Persistence
|   +-- repositories/
|   |   +-- user_repository_impl.{ext}
|   |   +-- order_repository_impl.{ext}
|   +-- entities/                   # Database entity definitions
|   |   +-- user_entity.{ext}
|   |   +-- order_entity.{ext}
|   +-- mappers/
|   |   +-- user_mapper.{ext}      # Entity <-> Model mapping
|   +-- migrations/
|       +-- 001_create_users.sql
|       +-- 002_create_orders.sql
+-- infrastructure/                 # Cross-cutting concerns
|   +-- config/
|   |   +-- app_config.{ext}
|   +-- logging/
|   |   +-- logger.{ext}
|   +-- database/
|       +-- connection.{ext}
+-- main.{ext}                      # Composition root
tests/
+-- unit/
|   +-- business/
|       +-- user_service_test.{ext}
|       +-- order_service_test.{ext}
+-- integration/
|   +-- data_access/
|       +-- user_repository_test.{ext}
+-- e2e/
    +-- api/
        +-- user_endpoints_test.{ext}
```

## Agent Instructions

### Building a New Feature

1. **Start with the Business Logic layer** -- Define the service method signature and the domain model. What data does this feature need? What rules apply?
2. **Define the Data Access interface** -- What repository methods does the service need? Add them to the interface in the Business Logic layer.
3. **Implement the Data Access layer** -- Write the repository implementation with SQL/ORM calls.
4. **Build the Presentation layer** -- Create the controller/endpoint, DTOs, and input validation.
5. **Wire it up** -- Register the new components in the DI container or composition root.
6. **Test** -- Unit test the service with a mock repository. Integration test the repository against a real database. E2E test the endpoint.

### Layer Communication Rules

**Presentation -> Business Logic:**
```
class UserController:
    constructor(user_service: UserService)

    POST /users (request):
        dto = validate(request.body)           # Presentation concern
        user = user_service.create_user(       # Call business layer
            name=dto.name,
            email=dto.email
        )
        return 201, UserResponse.from(user)    # Presentation concern
```

**Business Logic -> Data Access:**
```
class UserService:
    constructor(user_repo: UserRepository)     # Interface, not implementation

    create_user(name, email) -> User:
        user = User(name=name, email=email)
        user.validate()                        # Business rule
        if user_repo.exists_by_email(email):   # Call data access layer
            raise DuplicateEmailError
        user_repo.save(user)
        return user
```

### DTO Conventions

- **Request DTOs**: Used in the Presentation layer for input. Contain only fields from the HTTP/UI request. Validated in the Presentation layer.
- **Response DTOs**: Used in the Presentation layer for output. Shaped for the consumer (API client, UI template). May omit sensitive fields.
- **Domain Models**: Used in the Business Logic layer. Contain business rules and validations. Not serialized directly to HTTP responses.
- **Entities**: Used in the Data Access layer. Map directly to database tables/documents. Not exposed to upper layers.

### Naming Conventions

- **Controllers**: `{Entity}Controller` -- `UserController`, `OrderController`.
- **Services**: `{Entity}Service` -- `UserService`, `OrderService`.
- **Repository interfaces**: `{Entity}Repository` -- `UserRepository` (in business layer).
- **Repository implementations**: `{Entity}RepositoryImpl` or `{Technology}{Entity}Repository` -- `UserRepositoryImpl`, `SqlUserRepository`.
- **DTOs**: `{Action}{Entity}Request`, `{Entity}Response` -- `CreateUserRequest`, `UserResponse`.
- **Entities**: `{Entity}Entity` or `{Entity}Record` -- `UserEntity`, `OrderRecord`.

### What Lives Where

| Concern | Layer |
|---------|-------|
| HTTP request/response handling | Presentation |
| Input validation (format, required fields) | Presentation |
| Authentication/authorization checks | Presentation (middleware) |
| Business rule validation | Business Logic |
| Orchestrating multiple operations | Business Logic |
| Domain calculations | Business Logic |
| SQL queries, ORM calls | Data Access |
| Database connection management | Infrastructure |
| Logging configuration | Infrastructure |
| Environment/config loading | Infrastructure |

## Common Pitfalls

1. **Anemic Service Layer** -- Services that do nothing but delegate to the repository (pass-through methods). If the service layer adds no value, the application is too simple for layered architecture or the business logic has leaked into the wrong layer.
2. **Business Logic in Controllers** -- Validation of business rules, conditional logic, calculations, or orchestration in the Presentation layer. Controllers should be 5-15 lines: parse input, call service, format output.
3. **Business Logic in Data Access** -- Complex SQL queries that encode business rules (e.g., multi-join queries with CASE WHEN that determine pricing). These rules belong in the service layer, not embedded in SQL.
4. **Skipping Layers** -- Controllers calling repositories directly, bypassing the service layer. This makes business rules impossible to enforce consistently across different entry points.
5. **Circular Dependencies** -- A common sign of layer violation: the Data Access layer needs something from the Business Logic layer. Fix by defining interfaces in the Business Logic layer and implementing them in Data Access (Dependency Inversion).

## Platform-Specific Notes

### Java / Kotlin (Spring Boot)

- Use `@Controller` / `@RestController` for presentation, `@Service` for business logic, `@Repository` for data access.
- Spring's component scanning automatically wires layers via constructor injection.
- Use separate packages: `com.app.presentation`, `com.app.business`, `com.app.data`.
- Transaction management (`@Transactional`) belongs on the service layer.

### C# / ASP.NET Core

- Use separate projects for each layer in the solution: `App.Api`, `App.Business`, `App.Data`.
- Register services in `Program.cs` with `builder.Services.AddScoped<>()`.
- Use AutoMapper for DTO <-> Model <-> Entity mapping.

### Python (Django / Flask / FastAPI)

- Django: views = presentation, models + managers = business + data (Django couples these). Extract a `services.py` per app for business logic.
- FastAPI: routers = presentation, services = business logic, repositories = data access. Clean separation is natural.
- Flask: Blueprints = presentation grouping. Extract services and repositories as plain classes.

### TypeScript (Express / NestJS)

- NestJS has built-in layered support: Controllers, Services (Providers), and custom Repository providers.
- Express: Create `controllers/`, `services/`, `repositories/` directories manually.
- Use TypeScript interfaces for repository contracts in the service layer.

### Go

- Layered architecture maps naturally to Go packages: `handler/`, `service/`, `repository/`.
- Interfaces defined in the service package, implemented in the repository package.
- Use dependency injection through constructors in `main.go`.

### When Layered Architecture Becomes Limiting

Consider evolving to Clean Architecture or Hexagonal when:
- Multiple delivery mechanisms (REST + CLI + event consumer) need the same business logic.
- The data access layer needs to support multiple storage backends.
- Business logic complexity outgrows simple service methods.
- You need to test business rules with zero infrastructure dependencies.
- Cross-cutting concerns (auth, audit) become entangled with business logic.
