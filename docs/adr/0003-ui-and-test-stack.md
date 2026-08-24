# ADR 0003: Use a typed React domain with thin Chrome adapters

- Status: Accepted
- Date: 2026-08-24

## Context

The product has rich state transitions, drag-and-drop, two UI surfaces, persistence, and browser events. The code must remain small but highly testable.

## Decision

Use TypeScript, React, and Vite. Keep state transitions in pure domain functions. Put persistence, command transport, and tab operations behind typed adapters, with browser fallbacks only for development and component tests. Bundle the service worker as a separate Vite entry. Use Vitest and Testing Library for domain/component coverage and Playwright for a built-extension smoke path.

Use native pointer/drag events and CSS rather than a component framework or drag library. Use a small local icon set rather than an icon package.

## Alternatives challenged

- **Vanilla DOM: rejected.** It minimizes dependencies but makes shared reactive UI and accessible transient states harder to maintain.
- **A full design system: rejected.** It adds weight and visual sameness for a product with a compact, bespoke surface.
- **End-to-end tests only: rejected.** Browser extension tests are slower and less diagnostic than pure state and adapter tests.

## Consequences

- The production dependency surface remains narrow.
- Chrome-specific behavior is replaceable in tests.
- The service worker remains restart-safe and stores no authoritative state in globals.
- UI quality depends on disciplined local components and tokens rather than a framework.
