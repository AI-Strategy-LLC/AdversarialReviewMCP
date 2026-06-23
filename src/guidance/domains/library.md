+++
display_name = "Library / Framework"
applies_to = ["library", "crate", "package", "framework", "sdk", "module", "npm-package", "pypi-package"]
+++

# Library / Framework Domain Guidance

## Characteristics

Libraries and frameworks are consumed by other developers as dependencies. The public
API is the product. Changes to it affect every downstream consumer. Libraries must be
stable, well-documented, minimal in dependencies, and follow semantic versioning
strictly. The bar for quality is higher than for application code because bugs and
API design mistakes propagate across the ecosystem.

Key architectural decisions:
- **Library** (pulled in, called by application code): The consumer controls the flow. Provide building blocks. Minimize opinions. Example: serde, lodash, requests.
- **Framework** (calls application code, provides the skeleton): The framework controls the flow. Provide conventions and lifecycle hooks. Be opinionated where it reduces boilerplate. Example: Tokio, React, Django.
- **SDK** (client for a specific service): Wraps an API. Handles auth, serialization, retries, pagination. Mirror the API structure but add ergonomics for the target language.

## Key Conventions

- **Semantic versioning** is mandatory. MAJOR for breaking changes, MINOR for backward-compatible features, PATCH for backward-compatible fixes. Pre-1.0 releases may break in minor versions but should still be documented.
- **Minimal dependency tree.** Every dependency you add becomes your consumers' transitive dependency. Prefer zero-dependency or single-dependency designs. Vendor small utilities rather than depending on large frameworks.
- **Public API surface must be intentional.** Export only what consumers need. Use `pub(crate)` (Rust), underscore-prefixed names (Python), or `@internal` JSDoc tags to mark internal items. Audit exports before each release.
- **Every public item must be documented.** Functions need parameter descriptions, return type explanations, and usage examples. Types need field descriptions. Modules need overview documentation. Use `#[deny(missing_docs)]` in Rust.
- **Maintain a CHANGELOG.md.** Follow Keep a Changelog format. Document every user-visible change grouped by Added, Changed, Deprecated, Removed, Fixed, Security.
- **Provide an examples directory.** Runnable examples that demonstrate common use cases. These serve as both documentation and integration tests.

## Project Structure

```
# Rust crate example
src/
├── lib.rs                   # Public API re-exports, crate-level docs
├── builder.rs               # Builder pattern types (if applicable)
├── config.rs                # Configuration types
├── error.rs                 # Public error types (thiserror)
├── types.rs                 # Core public types
└── internal/                # Private implementation details
    ├── mod.rs
    ├── parser.rs
    └── codec.rs
examples/
├── basic_usage.rs           # Simplest possible example
├── advanced_config.rs       # Configuration options
└── error_handling.rs        # How to handle library errors
tests/
├── integration/             # Full API integration tests
│   ├── basic.rs
│   └── edge_cases.rs
└── fixtures/                # Test data files
benches/                     # Performance benchmarks
├── throughput.rs
└── memory.rs
CHANGELOG.md
README.md                    # Quick start, feature overview, links to docs
```

## Agent Instructions

1. **Design the public API before implementing internals.** Write the function signatures, type definitions, and doc comments first. Show the API to potential users (or review it yourself) before building the implementation.
2. **Write the README usage example first.** If the basic usage example is awkward or verbose, the API design is wrong. Iterate on the API until the example reads naturally.
3. **Implement the error type early.** Define a comprehensive error enum that covers all failure modes. Use `thiserror` (Rust), custom exception classes (Python), or typed errors (TypeScript). Errors are part of the public API.
4. **Keep the default configuration zero-config.** The library should work with sensible defaults. Every required configuration parameter is a barrier to adoption. Use the builder pattern for advanced options.
5. **Write property-based tests for core logic.** Libraries must handle inputs that application code would never generate. Use `proptest` (Rust), `hypothesis` (Python), or `fast-check` (JS) to find edge cases.
6. **Benchmark critical paths.** Include benchmarks from the start. Track performance across versions. Publish benchmark results in the repo so regressions are visible.
7. **Support the last two major versions of your language/runtime.** Check the minimum supported version in CI. Document the MSRV (Minimum Supported Rust Version) or equivalent.
8. **Never panic in library code.** Return `Result`/`Option` (Rust), raise exceptions with context (Python), or return error objects (JS). The application decides how to handle failures, not the library.

## Testing Strategy

- **Unit tests**: Every public function with multiple input scenarios. Test edge cases, empty inputs, maximum values, Unicode, and error paths.
- **Doc tests**: Ensure every code example in documentation compiles and runs correctly.
- **Integration tests**: Use the library as an external consumer would. Import only public APIs.
- **Property-based tests**: Generate random inputs and verify invariants hold.
- **Compatibility tests**: Test against the minimum supported language/runtime version and the latest stable version.
- **Benchmarks**: Track throughput, latency, and memory usage for critical operations.

## Common Pitfalls

- **Breaking changes in patch releases**: Anything that forces consumers to change their code is a breaking change. This includes removing public items, changing function signatures, changing default behavior, and tightening type constraints.
- **Leaking implementation details**: Exposing internal types in the public API locks you into implementation choices. Use newtype wrappers or re-export only the types consumers need.
- **Heavy dependency tree**: Adding a dependency for one function used in one place. Vendor small utilities. Evaluate the full transitive dependency tree before adding anything.
- **Missing `Send + Sync` bounds** (Rust): Library types used in async contexts must be thread-safe. Test that your public types implement `Send + Sync` where appropriate.
- **Undocumented panics**: Any code path that can panic must be documented in the function's doc comment under a "Panics" section. Prefer returning errors over panicking.
- **No migration guide for major versions**: When releasing a breaking change, provide a migration guide that shows before/after code for every change.
- **Ignoring feature flags/optional dependencies**: Use Cargo features (Rust), optional dependencies (Python extras), or peer dependencies (npm) to avoid forcing consumers to install packages they do not need.
- **Not testing with `--no-default-features`**: Ensure the library compiles and core functionality works when optional features are disabled.
