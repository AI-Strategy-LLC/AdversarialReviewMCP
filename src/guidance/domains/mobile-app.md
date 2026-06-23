+++
display_name = "Mobile Application"
applies_to = ["ios", "android", "react-native", "flutter", "swift", "kotlin", "mobile", "cross-platform"]
+++

# Mobile Application Domain Guidance

## Characteristics

Mobile applications run on iOS and Android devices with constrained resources, unreliable
networks, and platform-specific user expectations. They must handle app lifecycle events,
background execution limits, and app store review processes.

Key architectural decisions:
- **Native** (Swift/SwiftUI for iOS, Kotlin/Jetpack Compose for Android): Best performance and platform integration. Required when using advanced platform APIs (ARKit, HealthKit, NFC).
- **Cross-platform** (React Native, Flutter, .NET MAUI): Shared business logic with platform-specific UI where needed. Best when targeting both platforms with a small team.
- **Hybrid** (Capacitor, Ionic): Web technologies wrapped in a native shell. Fastest to ship but limited platform integration. Suitable for content-focused apps.

## Key Conventions

- Follow platform design guidelines: Apple Human Interface Guidelines (HIG) for iOS, Material Design 3 for Android. Users expect platform-native navigation patterns, gestures, and visual language.
- Design for offline-first. Cache data locally (SQLite, Realm, Core Data) and sync when connectivity is available. Show cached content immediately, then refresh.
- Handle all app lifecycle states: foreground, background, suspended, terminated. Save state on backgrounding. Restore state on relaunch.
- Request permissions lazily and contextually. Explain why you need camera/location/notifications before the system prompt appears. Never request all permissions at launch.
- Push notifications require server infrastructure (APNs for iOS, FCM for Android). Handle notification payloads for foreground, background, and killed states differently.
- Deep linking and universal links must be configured in both the app and the associated web domain. Test all link formats during development.

## Project Structure

```
# Native iOS (Swift)
App/
├── Sources/
│   ├── App/               # App entry point, lifecycle
│   ├── Features/          # Feature modules
│   │   ├── Auth/
│   │   ├── Home/
│   │   └── Settings/
│   ├── Core/              # Shared business logic
│   │   ├── Networking/
│   │   ├── Storage/
│   │   └── Models/
│   ├── UI/                # Reusable UI components
│   └── Utilities/
├── Resources/             # Assets, localization strings
└── Tests/

# Cross-platform (React Native)
src/
├── screens/               # Screen-level components
├── components/            # Reusable UI
├── navigation/            # React Navigation config
├── services/              # API, storage, analytics
├── stores/                # State management
├── hooks/                 # Custom hooks
├── utils/                 # Helpers
├── types/                 # TypeScript types
├── assets/                # Images, fonts
├── ios/                   # iOS native code
└── android/               # Android native code
```

## Agent Instructions

1. **Define the navigation structure first.** Mobile apps are navigation-driven. Map out the tab bar, stack navigators, and modal flows before building screens.
2. **Implement the networking and caching layer early.** This is the foundation. Use a repository pattern: Screen -> ViewModel/Hook -> Repository -> API + Cache.
3. **Build a design system of reusable components.** Buttons, inputs, cards, list items. Match platform conventions. Test on both platforms.
4. **Handle every edge case for connectivity.** Show meaningful UI when offline. Queue mutations for retry. Display sync status to the user.
5. **Test on real devices, not just simulators.** Performance, gestures, camera, GPS, and push notifications behave differently on hardware.
6. **Implement analytics from the start.** Track screen views, key actions, and error events. This data is essential for understanding real usage.
7. **Plan the app store submission early.** Prepare screenshots, descriptions, privacy labels, and review guidelines compliance before the first submission.
8. **Size assets correctly.** Provide @1x, @2x, @3x for iOS. Use vector drawables or density-specific PNGs for Android. Optimize image file sizes.

## Testing Strategy

- **Unit tests**: Business logic, data transformations, ViewModels. Run on host (no device needed).
- **Widget/component tests**: Render UI components in isolation. Verify layout and interaction.
- **Integration tests**: Feature flows with mocked services. Test navigation transitions.
- **E2E tests**: Critical paths (sign up, purchase, key feature) with Detox (React Native), XCUITest (iOS), or Espresso (Android).
- **Performance tests**: Monitor startup time, memory usage, and frame rate. Set budgets in CI.

## Common Pitfalls

- **Ignoring the back button on Android**: Android has a hardware/gesture back button. Your navigation stack must handle it correctly. Test back behavior on every screen.
- **Blocking the main thread**: Heavy computation, JSON parsing, or image processing on the UI thread causes jank. Use background threads/queues for any work that takes more than 16ms.
- **Not handling keyboard overlap**: Input fields behind the keyboard are a common issue. Use KeyboardAvoidingView (React Native), adjustResize (Android), or scroll views that account for the keyboard.
- **Hardcoding dimensions**: Use responsive layouts (Flexbox, Auto Layout constraints, ConstraintLayout). Test on small (iPhone SE) and large (iPad, tablet) screens.
- **Storing secrets in the app bundle**: API keys in source code can be extracted. Use a backend proxy for sensitive operations. Store user credentials in the Keychain (iOS) or EncryptedSharedPreferences (Android).
- **Ignoring app size**: Large binary sizes reduce install rates. Strip unused assets, use app thinning (iOS), and Android App Bundles.
- **Not testing upgrades**: Users update apps. Test database migrations, cached data compatibility, and onboarding flows for existing users.
- **Over-fetching data**: Mobile networks are slow and metered. Paginate lists, compress responses, and avoid downloading data the user will never see.
