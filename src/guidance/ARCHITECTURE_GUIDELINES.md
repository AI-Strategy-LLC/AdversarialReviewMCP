# Architectural Philosophy and Design Patterns

The architecture philosophy is based on Eskil Steenberg's battle-tested principles for building software that lasts decades and scales effortlessly.

## Core Principles

**"It's faster to write five lines of code today than to write one line today and then have to edit it in the future."**

Optimize for:

- **Human cognitive load** - not algorithmic efficiency
- **Long-term maintainability** - systems that work for decades
- **Team scalability** - one person per module maximum
- **Risk reduction** - avoiding the "lot of small failures = big failure" problem
- **Developer velocity** - consistent speed regardless of project size

## Strategic Architecture Framework

### 1. Primitive Identification

First, identify the core "primitives" - the fundamental data types that flow through the system:

- What is the basic unit of information?
- What operations are performed on this data?
- How can you generalize to handle future requirements?
- Examples: Unix files, graphics polygons, healthcare events, sensor data

### 2. Black Box Boundaries

Design module boundaries as perfect black boxes:

- **Input/Output only** - modules communicate through clean interfaces
- **Implementation agnostic** - internals can be completely rewritten
- **Documentation driven** - interface is fully documented and self-explaining
- **Future proof** - API works even as requirements evolve

### 3. Dependency Architecture

Structure dependencies to minimize risk:

- **Wrap external dependencies** - never depend directly on what you don't control
- **Layer abstraction** - platform layer -> core layer -> application layer
- **Modular replacement** - any component can be swapped without touching others
- **Version control friendly** - changes isolated to specific modules

### 4. Format Design Thinking

When designing interfaces and data formats:

- **Semantic vs Structural** - what does it mean vs how is it stored?
- **Implementation freedom** - don't lock users into specific technologies
- **Simplicity first** - easier to implement = better adoption and fewer bugs
- **Make choices** - one good way beats multiple complex options

## Planning Process

### Phase 1: Problem Analysis

1. **Identify the true problem** - what are you actually building?
2. **Find the primitives** - what data flows through your system?
3. **Map the ecosystem** - what external systems/platforms will you interact with?
4. **Assess risk factors** - what's most likely to change or break?

### Phase 2: Architecture Design

1. **Draw black box boundaries** - what modules do you need?
2. **Design clean interfaces** - how do modules communicate?
3. **Plan dependency layers** - what depends on what?
4. **Consider team structure** - who owns which modules?

### Phase 3: Implementation Strategy

1. **Build foundation first** - platform abstraction, core primitives
2. **Create test applications** - simple apps to validate your architecture
3. **Implement incrementally** - one module at a time
4. **Build tooling** - debugging, testing, and development aids

### Phase 4: Future Proofing

1. **Design for replaceability** - can modules be rewritten easily?
2. **Plan for scale** - will this work with 10x more features/users/developers?
3. **Consider maintenance** - who maintains this in 5 years?
4. **Document interfaces** - can new developers contribute immediately?

## Risk Assessment Framework

Evaluate these common failure modes:

- **Platform dependency** - what if the underlying platform changes?
- **Language/framework churn** - what if your tech stack becomes obsolete?
- **Team changes** - what if key developers leave?
- **Requirement evolution** - what if you need features you didn't plan for?
- **Scale challenges** - what if success creates new problems?

## Strategic Questions

For any architecture decision:

1. **Replaceability**: Can this component be rewritten from scratch using only its interface?
2. **Cognitive load**: Can one developer understand and maintain this module?
3. **Future flexibility**: Will this still make sense with 10x the requirements?
4. **Risk isolation**: If this fails, does it bring down other components?
5. **Team scaling**: Can we add more developers without coordination overhead?

## Common Patterns

### The Platform Layer Pattern

Always wrap external dependencies:
- Operating system APIs
- Third-party libraries
- Cloud services
- Hardware interfaces

### The Core + Plugins Pattern

Build extensible systems:
- Minimal, stable core
- Plugin architecture for features
- Clean plugin interfaces
- Independent plugin development

### The Glue Code Pattern

Connect systems without tight coupling:
- Translation layers between different APIs
- Gradual migration paths
- Multiple interface support
- Backward compatibility bridges

## Technology Preferences

### Languages
- **Rust** - Systems programming, performance-critical code, CLI tools
- **Swift** - Apple platforms (iOS, macOS, visionOS)
- **TypeScript** - Web frontends, Node.js backends
- **Python** - Data science, scripting, ML pipelines

### Frameworks
- **SwiftUI** - Native Apple UI
- **React** - Web UI
- **Tauri** - Cross-platform desktop apps
- **Tokio** - Async Rust runtime

### Infrastructure
- **Serverless first** - Lambda, CloudFront, DynamoDB
- **Infrastructure as Code** - Terraform, CDK
- **Container fallback** - ECS/Fargate when serverless doesn't fit
