+++
display_name = "Web Application"
applies_to = ["frontend", "fullstack", "spa", "ssr", "ssg", "react", "vue", "angular", "nextjs", "svelte"]
+++

# Web Application Domain Guidance

## Characteristics

Web applications serve interactive user interfaces through browsers. They range from
simple static sites to complex single-page applications with real-time features.
The defining trait is delivery via HTTP and rendering in a browser environment with
HTML, CSS, and JavaScript.

Key architectural decisions:
- **SPA** (Single Page Application): Client-side routing, rich interactivity, API-driven. Best for app-like experiences.
- **SSR** (Server-Side Rendering): HTML generated on each request. Better SEO, faster first paint. Use for content-heavy or public-facing pages.
- **SSG** (Static Site Generation): HTML generated at build time. Best performance and caching. Use for content that changes infrequently.
- **Hybrid**: Frameworks like Next.js and Nuxt allow mixing strategies per route.

## Key Conventions

- Use a component-based UI framework (React, Vue, Svelte, Angular). Prefer function components over class components in React.
- State management follows a hierarchy: local state first, then context/stores, then global state management (Redux, Zustand, Pinia) only when needed.
- API communication should be centralized in a service layer, never scattered across components. Use a data-fetching library (TanStack Query, SWR, Apollo) for caching and deduplication.
- Authentication tokens belong in httpOnly cookies for security, not localStorage. Use a middleware or route guard pattern for protected routes.
- CSS should be scoped to components. Prefer CSS Modules, Tailwind utility classes, or CSS-in-JS. Avoid global stylesheets beyond resets and design tokens.
- All user-facing strings should be externalizable for i18n from the start, even if only one language is supported initially.

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.module.css
│   │   └── Button.test.tsx
│   └── ...
├── pages/               # Route-level components (or app/routes/ for file-based routing)
├── layouts/             # Page layout wrappers (header, sidebar, footer)
├── hooks/               # Custom React hooks / composables
├── services/            # API client, auth service, analytics
├── stores/              # Global state management
├── utils/               # Pure utility functions
├── types/               # Shared TypeScript types/interfaces
├── assets/              # Static assets (images, fonts, icons)
├── styles/              # Global styles, design tokens, theme
└── __tests__/           # Integration and E2E test helpers
public/                  # Static files served as-is
```

## Agent Instructions

1. **Start with routing and layout.** Define the route structure and page shell before building individual features.
2. **Build components bottom-up.** Create small, well-tested primitives (Button, Input, Card) before composing them into complex views.
3. **Separate data fetching from presentation.** Container components or hooks handle data; presentational components receive props and render UI.
4. **Write types first.** Define TypeScript interfaces for API responses and component props before implementing logic.
5. **Handle loading and error states for every async operation.** Never leave a component in an indeterminate state. Provide skeleton loaders, not spinners, where possible.
6. **Implement responsive design from the start.** Use mobile-first media queries. Test at 320px, 768px, 1024px, and 1440px breakpoints.
7. **Ensure accessibility.** Use semantic HTML elements. Add ARIA labels where semantics are insufficient. Ensure keyboard navigation works. Test with a screen reader.
8. **Optimize assets.** Lazy-load images, code-split routes, compress static assets. Measure with Lighthouse.

## Testing Strategy

- **Unit tests**: Pure logic, utility functions, custom hooks. Use Vitest or Jest.
- **Component tests**: Render components in isolation with Testing Library. Test behavior, not implementation.
- **Integration tests**: Test feature flows (login, checkout) with mocked API responses.
- **E2E tests**: Critical user journeys with Playwright or Cypress. Keep these minimal and stable.
- **Visual regression**: Use Storybook with Chromatic or Percy for UI consistency.

## Common Pitfalls

- **Premature state management**: Reaching for Redux/Zustand before trying local state and prop drilling. Most apps need far less global state than developers expect.
- **Fetching in useEffect without cleanup**: Always handle race conditions and component unmounting. Use a data-fetching library instead of raw fetch-in-effect.
- **Ignoring bundle size**: Import only what you need. Use dynamic imports for heavy libraries. Monitor bundle size in CI.
- **Inline styles and magic numbers**: Use design tokens for spacing, colors, and typography. Keep the visual language consistent.
- **Not handling auth token expiry**: Implement silent refresh or redirect to login when tokens expire. Test the refresh flow.
- **Skipping error boundaries**: Wrap route segments in error boundaries so a single component crash does not take down the entire app.
- **Testing implementation details**: Asserting on internal state or CSS class names instead of user-visible behavior leads to brittle tests.
- **Ignoring CORS in development**: Configure the dev server proxy to match production behavior. Do not rely on browser extensions to disable CORS.
