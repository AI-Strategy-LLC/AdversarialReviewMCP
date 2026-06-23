+++
display_name = "MVVM"
applies_to = ["ios", "macos", "android", "desktop"]
+++

# Model-View-ViewModel (MVVM)

## When to Use

- Building native UI applications with reactive/declarative frameworks (SwiftUI, Jetpack Compose, WPF/MAUI, Flutter).
- Applications where the UI needs to observe and react to state changes without manual refresh logic.
- Projects where you want to unit-test presentation logic without instantiating real views or UI frameworks.
- Any platform with first-class data-binding support -- MVVM leverages the framework's binding system to eliminate boilerplate.

## Key Principles

1. **The View is a function of state** -- The View renders whatever the ViewModel exposes. It does not fetch data, compute derived values, or make business decisions. It observes and renders.
2. **The ViewModel is a state container with presentation logic** -- It holds the current UI state, transforms model data into display-ready values, handles user intents, and publishes state changes. It never imports UIKit, SwiftUI View types, Android View classes, or any UI framework types.
3. **The Model is the source of truth** -- Domain entities, business rules, and data access. The Model knows nothing about how data is displayed.
4. **Bindings replace callbacks** -- Use the platform's reactive binding mechanism (@Published + ObservableObject in SwiftUI, StateFlow in Kotlin, INotifyPropertyChanged in .NET) rather than manual delegation or notification patterns.
5. **User actions flow down, state flows up** -- The View calls ViewModel methods for user actions (button taps, text input). The ViewModel updates its published state. The View re-renders automatically.
6. **One ViewModel per screen or component** -- Do not create a single ViewModel for the entire app. Each screen or complex component gets its own ViewModel scoped to its responsibilities.

## Project Structure

```
app/
+-- models/
|   +-- User.swift                  # Domain entity
|   +-- Order.swift
|   +-- services/
|       +-- UserService.swift       # Data access / API calls
|       +-- OrderService.swift
+-- views/
|   +-- UserList/
|   |   +-- UserListView.swift      # SwiftUI View / Composable / XAML
|   |   +-- UserListViewModel.swift
|   |   +-- UserRowView.swift       # Subcomponent view
|   +-- OrderDetail/
|   |   +-- OrderDetailView.swift
|   |   +-- OrderDetailViewModel.swift
|   +-- Components/                 # Reusable UI components (no ViewModel)
|       +-- LoadingSpinner.swift
|       +-- ErrorBanner.swift
+-- navigation/
|   +-- AppRouter.swift             # Navigation coordinator
+-- di/
|   +-- Container.swift             # Dependency injection setup
tests/
+-- viewmodels/
|   +-- UserListViewModelTests.swift
|   +-- OrderDetailViewModelTests.swift
+-- models/
    +-- UserServiceTests.swift
```

## Agent Instructions

### File Naming

- **Views**: `{FeatureName}View.{ext}` -- e.g., `UserListView.swift`, `OrderDetailView.kt`.
- **ViewModels**: `{FeatureName}ViewModel.{ext}` -- e.g., `UserListViewModel.swift`.
- **Models**: `{EntityName}.{ext}` -- e.g., `User.swift`, `Order.kt`.
- **Co-locate View and ViewModel** in the same feature directory.

### When Creating a New Screen

1. Create the ViewModel first. Define its published/observable state properties and action methods.
2. Write unit tests for the ViewModel -- test state transitions, not UI rendering.
3. Create the View that observes the ViewModel and renders its state.
4. Wire up dependency injection so the ViewModel receives its service dependencies.
5. Connect navigation.

### ViewModel Design Rules

- Every piece of text displayed in the View should originate from a ViewModel property (not computed inline in the View).
- Format dates, currencies, and numbers in the ViewModel, not the View.
- Expose loading/error/empty states as an enum, not separate booleans:
  ```
  enum ViewState<T> {
    case idle
    case loading
    case loaded(T)
    case error(String)
  }
  ```
- Keep ViewModel methods synchronous where possible; use async/await or coroutines for data fetching.
- Never store a reference to the View inside the ViewModel.

### View Design Rules

- Views are declarative descriptions of UI. Minimize imperative logic.
- Use the platform's binding mechanism exclusively -- do not poll or manually refresh.
- Extract reusable UI elements into standalone View components that take plain data, not ViewModels.
- Keep views under 100 lines. If a View file grows larger, extract subcomponents.

## Common Pitfalls

1. **ViewModel imports UI framework** -- If your ViewModel imports SwiftUI, UIKit, Android View, or System.Windows, it is wrong. The ViewModel must be testable without a UI runtime.
2. **Business logic in the View** -- Sorting, filtering, validation, and formatting belong in the ViewModel. The View should only have layout and rendering code.
3. **Massive ViewModel** -- A ViewModel with 500+ lines is doing too much. Split into child ViewModels or extract domain logic into services.
4. **Two-way binding abuse** -- Two-way bindings for form fields are fine. Using them to synchronize state between unrelated components creates spaghetti. Prefer unidirectional data flow.
5. **Skipping the Model layer** -- ViewModels that make API calls directly become untestable and tightly coupled. Always inject a service/repository interface.

## Platform-Specific Notes

### SwiftUI (iOS / macOS)

- ViewModels should be `@Observable` classes (Swift 5.9+) or conform to `ObservableObject` with `@Published` properties (older projects).
- Views own their ViewModel via `@State` (for `@Observable`) or `@StateObject` (for `ObservableObject`). Child views receive it via parameter or `@Environment`.
- Use `@Environment` for cross-cutting concerns (color scheme, locale), not for passing ViewModels deep into hierarchies. Prefer explicit injection.
- For navigation, use `NavigationStack` with a path-based approach. The ViewModel can drive navigation by mutating a navigation path value.

```swift
@Observable
final class UserListViewModel {
    private let userService: UserServiceProtocol
    var state: ViewState<[User]> = .idle

    init(userService: UserServiceProtocol) {
        self.userService = userService
    }

    func loadUsers() async {
        state = .loading
        do {
            let users = try await userService.fetchUsers()
            state = .loaded(users)
        } catch {
            state = .error(error.localizedDescription)
        }
    }
}
```

### Android (Kotlin / Jetpack Compose)

- ViewModels extend `androidx.lifecycle.ViewModel`. Expose state via `StateFlow` or `MutableStateFlow`.
- Compose screens observe state with `collectAsStateWithLifecycle()`.
- Use `viewModelScope` for coroutine launches. Never launch coroutines from Composables.
- Inject dependencies with Hilt (`@HiltViewModel` + `@Inject constructor`).
- Navigation: Use the Navigation component. ViewModels should not reference `NavController`.

```kotlin
@HiltViewModel
class UserListViewModel @Inject constructor(
    private val userRepository: UserRepository
) : ViewModel() {
    private val _state = MutableStateFlow<ViewState<List<User>>>(ViewState.Idle)
    val state: StateFlow<ViewState<List<User>>> = _state.asStateFlow()

    fun loadUsers() {
        viewModelScope.launch {
            _state.value = ViewState.Loading
            userRepository.getUsers()
                .onSuccess { _state.value = ViewState.Loaded(it) }
                .onFailure { _state.value = ViewState.Error(it.message) }
        }
    }
}
```

### WPF / .NET MAUI (C#)

- ViewModels implement `INotifyPropertyChanged`. Use the CommunityToolkit.Mvvm source generators (`[ObservableProperty]`, `[RelayCommand]`) to reduce boilerplate.
- Bind in XAML with `{Binding PropertyName}`. Set `DataContext` in code-behind or via DI container.
- Use `ICommand` / `RelayCommand` for button actions.
- Navigation: Use a navigation service interface injected into ViewModels.

### Flutter (Dart)

- Use `ChangeNotifier` with `Provider` or `Riverpod` for state management.
- ViewModels are plain Dart classes extending `ChangeNotifier`.
- Widgets observe via `Consumer` or `ref.watch()`.
- Keep Widget build methods focused on layout; all logic in the ViewModel/Notifier.
