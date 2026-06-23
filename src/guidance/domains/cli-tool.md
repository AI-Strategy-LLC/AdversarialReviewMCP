+++
display_name = "CLI Tool"
applies_to = ["cli", "command-line", "terminal", "shell", "devtool", "scripting"]
+++

# CLI Tool Domain Guidance

## Characteristics

Command-line tools are invoked from a terminal, accept arguments and flags, process
input, and produce output. They are composable building blocks in Unix philosophy:
each tool does one thing well, reads from stdin, writes to stdout, and communicates
errors via stderr. Good CLI tools are scriptable, discoverable, and predictable.

Key architectural decisions:
- **Single command** vs **subcommand tree**: Simple tools (grep, curl) use flags. Complex tools (git, docker, cargo) use subcommands.
- **Interactive** vs **non-interactive**: Batch tools should never prompt for input when stdin is not a TTY. Interactive features (prompts, spinners) are opt-in.
- **Stateless** vs **stateful**: Most CLI tools are stateless per invocation. Tools that maintain state (databases, config) should store it in well-known XDG-compliant paths.

## Key Conventions

- **Exit codes**: 0 for success, 1 for general errors, 2 for usage errors. Document any additional exit codes. Never exit 0 on failure.
- **Output streams**: Normal output goes to stdout. Errors, warnings, and progress indicators go to stderr. This ensures output is pipeable even when errors occur.
- **Argument parsing**: Use a mature library (clap for Rust, argparse/click for Python, cobra for Go). Support both `--long-flag` and `-s` short forms. Accept `--flag=value` and `--flag value`.
- **Config file precedence**: Command-line flags override environment variables, which override config file values, which override defaults. Document this hierarchy.
- **Color and formatting**: Detect TTY. Use color and formatting only when stdout is a terminal. Respect `NO_COLOR` environment variable. Provide `--no-color` flag.
- **Versioning**: Support `--version` flag. Print `tool-name x.y.z` to stdout.
- **Help**: Support `--help` and `-h`. Print usage synopsis, description, flag list with defaults, examples, and environment variables. For subcommand tools, support `tool help subcommand`.

## Project Structure

```
src/
├── main.rs (or main.py, main.go)   # Entry point: parse args, dispatch, set exit code
├── cli.rs                           # Argument definitions and parsing config
├── commands/                        # One module per subcommand
│   ├── init.rs
│   ├── run.rs
│   └── config.rs
├── config.rs                        # Config file loading and merging
├── output.rs                        # Formatting, color, table rendering
├── error.rs                         # Error types with user-friendly messages
└── lib.rs                           # Core logic (testable without CLI wrapper)
tests/
├── integration/                     # Run the actual binary, assert on output
│   ├── test_init.rs
│   └── test_run.rs
└── fixtures/                        # Sample config files, input data
docs/
├── man/                             # Man page sources (roff or mdoc)
└── examples/                        # Example scripts and workflows
```

## Agent Instructions

1. **Separate CLI parsing from logic.** The `main` function parses arguments and calls library functions. All business logic lives in a library crate/module that can be tested without invoking the binary.
2. **Design the argument interface first.** Write out the help text for every command and flag before implementing. This is your public API. Get it right early.
3. **Implement `--help` and `--version` before anything else.** These are the first things users try.
4. **Support progressive verbosity.** Default output should be concise. `-v` adds detail. `-vv` adds debug info. `-q` suppresses all but errors. Use stderr for progress.
5. **Make output machine-parseable.** Support `--json` or `--format json` for structured output. Default to human-friendly output, but enable scripting.
6. **Handle signals gracefully.** Catch SIGINT (Ctrl+C) and SIGTERM. Clean up temp files, release locks, and exit promptly. Do not trap SIGKILL.
7. **Provide shell completions.** Generate completions for bash, zsh, and fish. Most argument parsing libraries support this natively.
8. **Write integration tests that invoke the compiled binary.** Use `assert_cmd` (Rust), `subprocess` (Python), or `os/exec` (Go) to test the actual CLI interface.

## Testing Strategy

- **Unit tests**: Core logic functions. Test data transformations, config merging, output formatting.
- **Integration tests**: Invoke the binary with various argument combinations. Assert on stdout content, stderr content, and exit code.
- **Fixture tests**: Run the tool against known input files and compare output to expected output (golden files/snapshot testing).
- **Error tests**: Verify that invalid inputs produce helpful error messages and correct exit codes.
- **Script tests**: Write short shell scripts that use the tool in realistic pipelines to catch integration issues.

## Common Pitfalls

- **Printing errors to stdout**: Errors must go to stderr. Mixing error messages into stdout breaks piping (`tool | jq` fails if errors are in stdout).
- **Not detecting TTY**: Unconditional color codes corrupt output when piped to a file. Always check `isatty(stdout)` before adding formatting.
- **Prompting in non-interactive mode**: If stdin is not a TTY, never prompt. Either use a default value or fail with a clear error asking the user to provide the value via flag.
- **Hardcoded paths**: Use `$XDG_CONFIG_HOME`, `$HOME`, and platform-appropriate directories. Never hardcode `/home/username/` or assume a specific OS.
- **Ignoring locale**: File paths can contain non-ASCII characters. Ensure your tool handles Unicode paths and output correctly.
- **Missing error context**: "Error: file not found" is useless. Print "Error: could not open config file '/path/to/config.toml': No such file or directory" with the full path and OS error.
- **No man page or comprehensive --help**: Users should not need to visit a website to learn basic usage. Invest in thorough built-in documentation.
- **Slow startup**: CLI tools should start in under 100ms. Avoid loading large frameworks, connecting to databases, or making network calls before parsing arguments.
