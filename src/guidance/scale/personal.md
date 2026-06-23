+++
display_name = "Personal Project"
applies_to = ["solo", "personal", "hobby", "side-project", "prototype", "hackathon", "learning"]
+++

# Personal Project Scale Guidance

## Characteristics

Personal projects are built and maintained by a single developer. The priority is
shipping working software quickly while keeping the codebase manageable enough to
return to after weeks or months away. Process overhead should be minimal. The biggest
risk is not over-engineering but abandonment -- choose the approach that keeps momentum.

Defining traits:
- Single contributor, single decision-maker.
- No code review process (but self-review before committing is valuable).
- The README is the primary documentation. If you cannot explain the project in the README, the project scope is unclear.
- Iteration speed matters more than architectural purity. Refactor when pain is felt, not preemptively.
- The audience is future-you, who will have forgotten every decision you made today.

## Key Conventions

- **README-driven development**: Write the README first. Describe what the project does, how to install it, how to use it, and how to develop it. This forces clarity on scope and priorities before any code is written.
- **Single branch workflow**: Work directly on `main`. Use feature branches only when experimenting with something you might want to revert. Avoid the overhead of PRs for a solo project.
- **Conventional commits**: Even solo, use consistent commit messages (`feat:`, `fix:`, `refactor:`, `docs:`). This makes `git log` useful when you return to the project months later.
- **Simple CI**: A GitHub Action that runs `build` and `test` on push to `main`. No staging environments, no deployment pipelines, no canary releases. Add complexity only when a real problem demands it.
- **One configuration file**: Keep all project configuration in as few files as possible. A single `Makefile`, `justfile`, or `package.json` scripts section that documents every common operation.
- **Pin dependencies**: Lock files (`Cargo.lock`, `package-lock.json`, `poetry.lock`) are committed. You do not want to debug a broken build caused by an upstream dependency update after a 3-month break.

## Project Structure

```
project/
├── src/                     # Source code
│   ├── main.rs              # Entry point
│   └── lib.rs               # Core logic (if applicable)
├── tests/                   # Tests (keep it simple)
├── examples/                # Usage examples (if it's a library)
├── .github/
│   └── workflows/
│       └── ci.yml           # Minimal CI: build + test
├── Cargo.toml               # Project config + dependencies
├── Cargo.lock               # Locked dependency versions
├── Makefile                  # Common commands: build, test, run, clean
├── README.md                # The most important file in the repo
├── LICENSE                  # Choose a license early
└── .gitignore
```

## Agent Instructions

1. **Start with a working skeleton.** Get the project compiling and running with a minimal feature before adding complexity. A "hello world" that builds in CI is a better starting point than an elaborate architecture that does not compile.
2. **Write tests for logic you will forget.** Skip tests for trivial glue code. Focus testing effort on algorithms, data transformations, and edge cases -- the code you will not remember how to debug in 3 months.
3. **Use TODO comments liberally.** Mark shortcuts, known issues, and planned improvements with `TODO:` comments. These are your backlog. Grep for them when you have time to improve things.
4. **Avoid premature abstraction.** Do not create interfaces, traits, or abstract classes until you have at least two concrete implementations. Duplicate code twice before extracting a shared abstraction.
5. **Choose boring technology.** Use languages and frameworks you already know well. A personal project is not the time to learn a new stack unless learning is the explicit goal. Ship with tools you are productive in.
6. **Keep deployment simple.** A single binary, a Docker container, or a static site. If deployment requires more than two commands, simplify it. Use platform services (Fly.io, Railway, Vercel) that deploy from git push.
7. **Document decisions in commit messages.** When you make a non-obvious choice, explain why in the commit message. This is cheaper than maintaining separate decision documents for a solo project.
8. **Set a time budget.** Personal projects expand to fill available time. Define what "done" looks like for the current session. Ship incremental improvements rather than pursuing perfection.

## Testing Strategy

- **Test what is hard to debug.** Complex algorithms, state machines, parsers, data transformations.
- **Skip testing obvious code.** Simple getters, UI layout, straightforward CRUD. The cost of writing and maintaining these tests exceeds their value for a solo project.
- **Use snapshot tests for output-heavy code.** Comparing output against golden files is faster than writing individual assertions.
- **Run tests in CI.** Even if you do not run them locally every time, CI catches breakage before it accumulates.

## Common Pitfalls

- **Over-engineering for scale you will never reach**: Building a microservice architecture for a project that will have 10 users. Start with a monolith. Split when you have a real reason.
- **Not committing frequently enough**: Large, infrequent commits make it hard to understand what changed and impossible to bisect bugs. Commit after every logical unit of work.
- **Skipping the README**: "I'll document it later" means never. Write the README first. Update it as the project evolves.
- **Choosing the wrong license**: Adding a license after others have contributed or forked creates legal ambiguity. Choose a license at project creation. MIT or Apache-2.0 for permissive, GPL for copyleft.
- **Perfectionism-driven abandonment**: Spending weeks on architecture for a weekend project leads to burnout and abandonment. Ship something ugly that works, then iterate.
- **No .gitignore**: Committing build artifacts, IDE config, or secrets because there was no `.gitignore`. Start with a language-appropriate template from gitignore.io.
- **Ignoring ergonomic development setup**: If building the project requires 5 manual steps, you will not work on it. Invest 30 minutes in a `Makefile` or `justfile` that makes `make run` work from a fresh clone.
- **Trying to support every platform from the start**: Build for the platform you use. Add cross-platform support only when someone asks for it (including future-you on a different machine).
