+++
display_name = "Event-Driven Architecture"
applies_to = ["all"]
+++

# Event-Driven Architecture

## When to Use

- Systems where components need to react to state changes without tight coupling between producers and consumers.
- Applications requiring high throughput and asynchronous processing (order processing, real-time analytics, IoT data ingestion).
- When you need an audit trail or temporal record of everything that happened in the system (event sourcing).
- Architectures where multiple downstream systems need to react to the same business event independently (fan-out).

## Key Principles

1. **Commands vs Events vs Queries** -- These are three fundamentally different message types. Commands are imperative instructions directed at a specific handler (`PlaceOrder`). Events are past-tense facts broadcast to any interested subscriber (`OrderPlaced`). Queries request data without side effects (`GetOrderStatus`). Never conflate them.
2. **Events are Immutable Facts** -- An event records something that has already happened. It cannot be rejected, retried, or undone. It can only be compensated for with a new event. Name events in past tense: `OrderPlaced`, `PaymentFailed`, `UserRegistered`.
3. **Producers Do Not Know Consumers** -- The producer publishes an event and moves on. It does not know (or care) how many consumers exist or what they do with the event. This is what creates loose coupling.
4. **Eventual Consistency is the Default** -- In event-driven systems, state across services is eventually consistent. Design for it. Do not fight it with distributed locks or two-phase commits.
5. **Idempotent Consumers** -- Messages may be delivered more than once (at-least-once delivery is the standard guarantee). Every consumer must handle duplicate events gracefully using idempotency keys, deduplication, or idempotent operations.
6. **Schema Evolution** -- Event schemas will change over time. Design for backward and forward compatibility from the start. Add fields, never remove or rename them. Version schemas explicitly.

## Project Structure

```
src/
+-- domain/
|   +-- events/
|   |   +-- order_events.{ext}      # Event type definitions
|   |   |   # OrderPlaced, OrderShipped, OrderCancelled
|   |   +-- payment_events.{ext}
|   |   +-- user_events.{ext}
|   |   +-- base_event.{ext}        # Common event envelope
|   +-- commands/
|   |   +-- place_order.{ext}       # Command definitions
|   |   +-- process_payment.{ext}
|   +-- entities/
|       +-- order.{ext}
+-- handlers/
|   +-- command_handlers/
|   |   +-- place_order_handler.{ext}   # Handles PlaceOrder command
|   |   +-- process_payment_handler.{ext}
|   +-- event_handlers/
|       +-- order_placed/
|       |   +-- send_confirmation_email.{ext}   # One handler per reaction
|       |   +-- update_inventory.{ext}
|       |   +-- notify_warehouse.{ext}
|       +-- payment_failed/
|           +-- notify_customer.{ext}
+-- infrastructure/
|   +-- messaging/
|   |   +-- event_bus.{ext}          # Event bus abstraction
|   |   +-- kafka_producer.{ext}     # Concrete broker implementation
|   |   +-- kafka_consumer.{ext}
|   |   +-- in_memory_bus.{ext}      # For testing
|   +-- event_store/
|   |   +-- event_store.{ext}        # If using event sourcing
|   |   +-- postgres_event_store.{ext}
|   +-- serialization/
|       +-- event_serializer.{ext}
+-- projections/                     # Read-model builders (if event sourcing)
|   +-- order_summary_projection.{ext}
|   +-- daily_revenue_projection.{ext}
schemas/
+-- events/
|   +-- order_placed.v1.json         # JSON Schema / Avro / Protobuf
|   +-- order_placed.v2.json
|   +-- payment_completed.v1.json
tests/
+-- unit/
|   +-- handlers/
+-- integration/
    +-- messaging/
```

## Agent Instructions

### Event Envelope Schema

Every event must include a standard envelope with metadata. Use this structure consistently:

```json
{
  "event_id": "uuid-v4",
  "event_type": "OrderPlaced",
  "event_version": 1,
  "timestamp": "2024-01-15T10:30:00Z",
  "source": "order-service",
  "correlation_id": "uuid-v4",
  "causation_id": "uuid-v4",
  "payload": {
    "order_id": "ORD-12345",
    "customer_id": "CUST-789",
    "total_amount": 150.00,
    "currency": "USD"
  }
}
```

- `event_id`: Unique identifier for this event instance. Used for deduplication.
- `correlation_id`: Traces the entire business transaction across events.
- `causation_id`: The `event_id` of the event that directly caused this one.
- `event_version`: Schema version. Increment when the payload structure changes.

### Creating a New Event

1. Define the event type in `domain/events/` with its payload structure.
2. Create or update the schema file in `schemas/events/`.
3. Implement command handler(s) that produce the event.
4. Implement event handler(s) that consume the event.
5. Register handlers with the event bus / message broker.
6. Write tests: verify the command handler publishes the correct event, verify each event handler processes it correctly.

### Event Naming Convention

- **Events**: `{Entity}{PastTenseVerb}` -- `OrderPlaced`, `PaymentCompleted`, `UserEmailChanged`.
- **Commands**: `{Verb}{Entity}` -- `PlaceOrder`, `ProcessPayment`, `ChangeUserEmail`.
- **Event handler files**: Named after the reaction, not the event -- `send_confirmation_email.{ext}`, not `handle_order_placed.{ext}`.

### Event Sourcing (When Applicable)

If the system uses event sourcing:
- Entity state is derived by replaying events, not stored directly.
- The event store is the single source of truth. There are no UPDATE or DELETE operations.
- Build projections (read models) from the event stream for queries.
- Snapshots optimize replay for entities with long event histories.

### Consumer Group and Topic Design

- One topic per event type or per aggregate: `orders.events`, `payments.events`.
- Consumer groups per handler: `send-confirmation-email-consumer`, `update-inventory-consumer`.
- Use dead-letter queues for events that fail processing after retries.

## Common Pitfalls

1. **Event as Remote Procedure Call** -- If an event carries a command-like name (`SendEmail`) and expects a response, it is not an event. It is a poorly disguised synchronous call. Events are fire-and-forget facts.
2. **Missing Idempotency** -- Without deduplication, replayed or redelivered events cause duplicate side effects (double charges, duplicate emails). Every consumer must be idempotent.
3. **Giant Event Payloads** -- Events should carry the minimum data needed. If consumers need full entity details, they query the source service. Exception: if the event represents a snapshot for event sourcing, it carries complete state.
4. **No Schema Registry** -- Without versioned schemas, producers and consumers evolve independently and break each other. Use a schema registry or at minimum version your event schemas in source control.
5. **Ignoring Ordering Guarantees** -- Events for the same entity may arrive out of order. Use partition keys (entity ID) to guarantee per-entity ordering within a topic. Design consumers to handle out-of-order delivery for cross-entity scenarios.

## Platform-Specific Notes

### Apache Kafka

- Topics are partitioned. Use entity ID as the partition key to guarantee ordering per entity.
- Consumer groups provide competing-consumer semantics. Each partition is consumed by exactly one consumer in the group.
- Use Kafka Streams or ksqlDB for stream processing and projections.
- Enable idempotent producer (`enable.idempotence=true`) to prevent duplicate publishes.

### RabbitMQ

- Use exchanges (topic or fanout) for event distribution. Each consumer binds a queue to the exchange.
- Dead-letter exchanges handle failed messages.
- Use publisher confirms for at-least-once delivery.

### AWS (EventBridge / SNS+SQS / Kinesis)

- EventBridge for application-level events with content-based routing rules.
- SNS+SQS for fan-out patterns where multiple SQS queues subscribe to one SNS topic.
- Kinesis for high-throughput ordered event streams (similar to Kafka).

### Rust

- Use `tokio::sync::broadcast` or `tokio::sync::mpsc` for in-process event buses.
- For persistent event sourcing, use PostgreSQL with `NOTIFY/LISTEN` or embed a Kafka client (`rdkafka` crate).
- Define events as enums with associated data for type-safe event handling.

### .NET

- MediatR for in-process command/event dispatching.
- MassTransit or NServiceBus for distributed messaging with RabbitMQ or Azure Service Bus.
- Use `record` types for immutable event definitions.
