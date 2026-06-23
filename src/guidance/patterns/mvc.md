+++
display_name = "MVC"
applies_to = ["web", "all"]
+++

# Model-View-Controller (MVC)

## When to Use

- Building server-rendered web applications with request/response cycles (Rails, Django, ASP.NET MVC, Spring MVC).
- Projects where the domain model is the central artifact and views are secondary presentations of that model.
- CRUD-heavy applications where the standard route-controller-model-view pipeline covers 80%+ of features.
- Teams that benefit from convention-over-configuration: predictable file locations, naming, and request flow.

## Key Principles

1. **Fat Models, Thin Controllers** -- Business logic belongs in the Model layer. Controllers should only receive input, call model methods, and select a view. If a controller method exceeds ~15 lines, extract logic into the model or a service object.
2. **One-way data flow**: Route -> Controller -> Model -> View. The View never mutates the Model directly; the Controller is the gatekeeper.
3. **Models are framework-agnostic where possible** -- Validation rules, domain calculations, and state transitions live on the model, not in controller callbacks or view helpers.
4. **Views are dumb templates** -- Views receive data and render it. No database queries in views. No business decisions in views. Conditional rendering is acceptable; conditional business logic is not.
5. **Controllers coordinate, they do not compute** -- A controller action reads parameters, invokes model behavior, and returns a response. That is its entire job.
6. **Use service objects when a single action spans multiple models** -- If a controller action needs to coordinate writes across multiple aggregates, extract a service/interactor rather than bloating one model.

## Project Structure

```
app/
+-- controllers/
|   +-- users_controller.rb        # or users_controller.py, UsersController.cs
|   +-- orders_controller.rb
|   +-- admin/
|       +-- dashboard_controller.rb
+-- models/
|   +-- user.rb                     # Domain model + persistence
|   +-- order.rb
|   +-- concerns/                   # Shared model behaviors (mixins/traits)
|       +-- auditable.rb
+-- views/
|   +-- users/
|   |   +-- index.html.erb          # or .html.djt, .cshtml, .jsp
|   |   +-- show.html.erb
|   |   +-- _form.html.erb          # Partials prefixed with underscore
|   +-- orders/
|   +-- layouts/
|       +-- application.html.erb
+-- services/                       # Optional: cross-model orchestration
|   +-- order_placement_service.rb
+-- helpers/                        # View-only formatting helpers
|   +-- users_helper.rb
config/
+-- routes.rb                       # or urls.py, routes config
db/
+-- migrations/
tests/
+-- models/
+-- controllers/
+-- integration/
```

## Agent Instructions

### File Naming

- **Controllers**: `{resource_plural}_controller.{ext}` -- e.g., `users_controller.rb`, `orders_controller.py`.
- **Models**: `{resource_singular}.{ext}` -- e.g., `user.rb`, `order.py`.
- **Views**: `{controller_name}/{action_name}.{template_ext}` -- e.g., `users/show.html.erb`.
- **Tests**: Mirror the `app/` directory under `tests/` or `spec/`.

### When Creating a New Resource

1. Create the model file with validations and associations first.
2. Create a migration for the database table.
3. Create the controller with standard CRUD actions (index, show, new, create, edit, update, destroy).
4. Create view templates for each action that renders HTML.
5. Add the resource route.
6. Write model tests for validations and business logic.
7. Write controller tests for request/response behavior.

### Controller Action Template

Every controller action should follow this skeleton:

```
def action_name
  # 1. Read input (params, session, headers)
  # 2. Call model / service
  # 3. Handle success / failure
  # 4. Render view or redirect
end
```

### When Logic Grows

- Model method > 20 lines? Extract a private method or a concern/mixin.
- Controller action > 15 lines? Extract a service object.
- View partial reused in 3+ places? Move to `shared/` partials directory.
- Multiple controllers share logic? Use a base controller or concern, not copy-paste.

## Common Pitfalls

1. **Logic in controllers** -- The most common MVC mistake. If you are writing `if/else` chains, loops over records, or calculation logic in a controller, move it to the model or a service.
2. **Database queries in views** -- N+1 queries hidden in templates destroy performance. Always eager-load associations in the controller and pass fully-loaded data to views.
3. **God models** -- A single model file with 1000+ lines. Break large models into concerns/mixins by responsibility (e.g., `User::Authentication`, `User::Billing`).
4. **Skipping the service layer** -- When an action touches 3+ models, jamming all logic into one model creates hidden coupling. Use a service object.
5. **Over-nesting routes** -- `/users/1/orders/2/items/3/reviews` is too deep. Limit nesting to one level. Use shallow routes.

## Platform-Specific Notes

### Ruby on Rails

- ActiveRecord models combine domain logic and persistence. Use `concerns/` for shared behavior.
- Prefer `before_action` callbacks for auth/loading, but do not chain more than 2-3 callbacks per controller.
- Use Strong Parameters (`params.require(:user).permit(:name, :email)`) in every create/update action.

### Django (Python)

- Models define fields in `models.py`; views (Django's "controller") live in `views.py`; templates in `templates/`.
- Django calls controllers "views" and views "templates" -- map accordingly: Django View = MVC Controller, Django Template = MVC View.
- Use class-based views (CBVs) for standard CRUD; function-based views (FBVs) for non-standard flows.
- Forms and serializers handle input validation, not views.

### ASP.NET MVC (C#)

- Controllers inherit from `Controller` base class. Actions return `IActionResult`.
- Models are typically plain C# classes (POCOs). Use Entity Framework for persistence.
- Razor views (`.cshtml`) for server-rendered HTML. Use ViewModels to shape data for views rather than passing entities directly.

### Spring MVC (Java/Kotlin)

- Annotate controllers with `@Controller` or `@RestController`.
- Use `@Service` for business logic classes, `@Repository` for data access.
- Return `ModelAndView` for server-rendered pages or response bodies for APIs.
- Use `@Valid` and Bean Validation annotations for input validation on DTOs.

### Express.js / Node.js

- There is no built-in MVC structure. Create `controllers/`, `models/`, `views/` directories manually.
- Use a router file per resource (`routes/users.js`) that delegates to controller functions.
- Models can use Mongoose (MongoDB), Sequelize (SQL), or Prisma.
- Views use template engines like EJS, Pug, or Handlebars.
