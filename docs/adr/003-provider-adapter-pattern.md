# ADR-003: Provider Adapter Pattern

## Status

Accepted

## Context

The system depends on multiple external integrations: weather data, market data, image generation, quote sourcing, and TV publishing. Each of these has multiple possible providers (e.g., Open-Meteo vs OpenWeatherMap for weather, Gemini vs OpenAI for image generation). Provider APIs change, rate-limit, or fail independently. The core scene logic must not be coupled to any specific provider's request/response format.

## Decision

All external integrations are placed behind adapter interfaces. Each integration domain (weather, market, image generation, quotes, TV publishing) defines a TypeScript interface with normalized semantic input/output types. Concrete provider implementations satisfy those interfaces. The application core imports only the interface, never the concrete provider.

## Consequences

- Core logic never imports provider-specific code. Provider response shapes do not leak into the domain layer.
- Providers are swappable via configuration without code changes to the scene pipeline.
- Mock providers enable full development and testing without API keys or network access.
- Each new provider requires only implementing the adapter interface, not modifying the orchestration code.
- Provider health and metadata are tracked uniformly regardless of which concrete provider is active.
- Slightly more upfront design work to define clean interfaces before implementing concrete adapters.
