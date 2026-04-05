# ADR-004: Scene Spec as Central Contract

## Status

Accepted

## Context

The system needs a single typed contract that captures everything about a generated scene: the effective settings at generation time, the semantic data from providers, the selected theme, overlay configuration, degradation state, and artifact paths. Without a central contract, scene metadata would be scattered across multiple database tables and in-memory structures, making it difficult to reproduce, debug, or compare scenes.

## Decision

The Scene Spec is the system-of-record for every generated scene. It is a comprehensive TypeScript type that records all inputs, decisions, and outputs for a single scene generation. Every preview candidate and every published scene corresponds to exactly one Scene Spec instance.

## Consequences

- All generation and rendering flows through Scene Spec. The orchestration pipeline produces a Scene Spec; the renderer consumes it.
- Preview and publish share the same contract. What the operator previews is exactly what gets published.
- Degradation state is captured in the Scene Spec, making it visible whether a scene was produced under normal or fallback conditions.
- Scene comparison and history are straightforward because every scene is a self-contained record.
- The Scene Spec type must be versioned carefully. Changes to the type affect the entire pipeline.
- Debugging is simplified because a Scene Spec contains all the context needed to understand why a scene looks the way it does.
