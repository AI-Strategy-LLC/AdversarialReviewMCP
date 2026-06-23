+++
display_name = "Desktop Application"
applies_to = ["desktop", "tauri", "electron", "qt", "gtk", "winui", "swiftui-macos", "native-gui"]
+++

# Desktop Application Domain Guidance

## Characteristics

Desktop applications run natively on user workstations (macOS, Windows, Linux).
They have direct access to the filesystem, system APIs, and hardware. Users expect
responsive UIs, keyboard shortcuts, system integration (file associations, drag and
drop, system tray), and the ability to work offline. Desktop apps must handle
platform differences in windowing, menus, notifications, and packaging.

Key architectural decisions:
- **Native per platform** (SwiftUI/AppKit for macOS, WinUI/WPF for Windows, GTK for Linux): Best platform integration and performance. High development cost for multi-platform.
- **Cross-platform native** (Qt, .NET MAUI): Shared C++/C# codebase with native rendering. Good platform feel but requires per-platform testing and tuning.
- **Web-based shell** (Tauri, Electron): Web frontend with native backend for system access. Fastest multi-platform development. Tauri is preferred over Electron for smaller binary size and lower memory usage.
- **Rust + WebView** (Tauri v2): Rust backend for performance-critical and system-level work, WebView frontend for UI. Good balance of capability and development speed.

## Key Conventions

- Follow platform conventions: macOS uses a global menu bar, Command key, and `.app` bundles. Windows uses in-window menus, Control key, and `.msi`/`.exe` installers. Linux varies by desktop environment but generally follows freedesktop.org standards.
- Implement standard keyboard shortcuts: Cmd/Ctrl+S (save), Cmd/Ctrl+Z (undo), Cmd/Ctrl+Q (quit), Cmd/Ctrl+W (close window), Cmd/Ctrl+, (preferences). Users expect these to work without configuration.
- Use a model-view separation. The UI layer should never contain business logic. This enables testing the core without a GUI and allows future UI framework changes.
- Save user preferences in the platform-standard location: `~/Library/Preferences/` (macOS), `%APPDATA%` (Windows), `$XDG_CONFIG_HOME` (Linux).
- Auto-save documents or prompt to save unsaved changes before closing. Users lose trust in apps that silently discard work.
- Support system-native file dialogs for open/save operations. Never build a custom file picker when the OS provides one.

## Project Structure

```
# Tauri v2 example
crates/
├── src-tauri/               # Rust backend
│   ├── src/
│   │   ├── main.rs          # App entry, Tauri builder
│   │   ├── commands/        # Tauri command handlers (IPC endpoints)
│   │   ├── state.rs         # Managed application state
│   │   ├── menu.rs          # Native menu construction
│   │   ├── tray.rs          # System tray handling
│   │   └── updater.rs       # Auto-update logic
│   ├── Cargo.toml
│   ├── tauri.conf.json      # Tauri configuration
│   └── icons/               # App icons (all required sizes)
├── ui/                      # Frontend (React/Svelte/Vue)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── styles/
│   ├── package.json
│   └── vite.config.ts
└── core/                    # Shared logic crate (no UI dependency)
    ├── src/
    │   └── lib.rs
    └── Cargo.toml
```

## Agent Instructions

1. **Define the IPC interface between frontend and backend first.** In Tauri, these are Tauri commands. Document each command's parameters and return types. This is the internal API contract.
2. **Implement window management early.** Multi-window support, window state persistence (size, position), and proper close handling must be in place before building features.
3. **Build the menu bar and keyboard shortcuts before feature work.** These define the app's structure and are hard to retrofit. Include standard Edit menu (undo, redo, cut, copy, paste) items.
4. **Handle file operations with care.** Always use async file I/O to avoid blocking the UI thread. Show progress for large operations. Handle permission errors gracefully.
5. **Implement auto-update from the start.** Users expect desktop apps to update seamlessly. Tauri has built-in updater support. Configure update checking on launch with a non-blocking UI notification.
6. **Test on all target platforms in CI.** Platform-specific bugs are common. Test file paths (case sensitivity, path separators), keyboard shortcuts, and window behavior on each platform.
7. **Optimize startup time.** Desktop apps should show a window within 500ms. Defer heavy initialization (database loading, network requests) until after the window is visible. Use splash screens for unavoidable delays.
8. **Package and sign correctly.** macOS apps must be notarized. Windows apps should be signed with an EV certificate. Linux apps should provide `.deb`, `.rpm`, and AppImage formats.

## Testing Strategy

- **Unit tests**: Core logic crate, state management, data transformations. No GUI dependency.
- **Command tests**: Test Tauri commands (IPC handlers) directly by calling them with mock state.
- **UI component tests**: Test frontend components in isolation using Testing Library.
- **Integration tests**: Full app tests using Tauri's test harness or WebDriver.
- **Platform tests**: Run the test suite on macOS, Windows, and Linux in CI. Test platform-specific behaviors.

## Common Pitfalls

- **Blocking the UI thread**: Any operation that takes more than 50ms should be async. File I/O, network calls, heavy computation -- all must happen off the main thread with progress reporting.
- **Ignoring DPI scaling**: High-DPI displays are standard. Use logical pixels, not physical pixels. Test at 100%, 150%, and 200% scaling. Ensure icons are crisp at all scales.
- **Hardcoded file paths**: Use platform-appropriate directory APIs. Never assume `/` or `\` as the path separator. Never hardcode user home directories.
- **No graceful error recovery**: A failed network request should not crash the app. Show an error, offer retry, and let the user continue working with cached data.
- **Forgetting system tray cleanup**: If your app minimizes to the system tray, ensure it can be fully quit from the tray menu. Remove the tray icon on exit.
- **Not testing installation and uninstallation**: Test the full lifecycle: install, first launch, update, uninstall. Verify clean uninstallation removes config files (optionally) and preferences.
- **Leaking memory in long sessions**: Desktop apps run for hours or days. Profile memory usage over extended sessions. Watch for growing caches, unreleased file handles, and listener accumulation.
- **Ignoring accessibility**: Support screen readers, keyboard-only navigation, and high-contrast modes. On macOS, test with VoiceOver. On Windows, test with Narrator.
