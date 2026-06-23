+++
display_name = "Pipe and Filter"
applies_to = ["all"]
+++

# Pipe and Filter Architecture

## When to Use

- Data transformation pipelines where input data flows through a series of processing steps to produce output (ETL, log processing, image processing, audio processing).
- Compiler and language tooling: lexing -> parsing -> AST transformation -> optimization -> code generation.
- Systems where each processing step should be independently testable, reusable, and replaceable.
- Workflows that benefit from the Unix philosophy: each component does one thing well, and components compose through a standard interface.

## Key Principles

1. **Each Filter is a Pure Transformation** -- A filter takes input, transforms it, and produces output. It does not depend on global state, database connections, or other filters. Given the same input, it always produces the same output. Side effects (logging, metrics) are secondary concerns handled by the pipe infrastructure.
2. **Pipes Define the Standard Interface** -- All data flows through a uniform interface between filters. The pipe defines the data format (bytes, records, typed messages, streams). Filters do not know about their neighbors; they only know the data contract.
3. **Filters are Independent and Composable** -- Any filter can be removed, replaced, or reordered without modifying other filters. New filters can be inserted at any point in the pipeline. This composability is the pattern's greatest strength.
4. **Streaming Over Batching When Possible** -- Prefer processing data as it flows through (streaming/incremental) rather than collecting all input before processing (batch). Streaming reduces memory usage and latency. Use batch only when the transformation inherently requires the full dataset (sorting, global aggregation).
5. **Error Handling is Explicit at Each Stage** -- Each filter handles its own error cases. Failed records can be routed to a dead-letter channel, logged, or passed downstream with error markers. The pipeline does not silently drop data.
6. **Pipeline Configuration is Declarative** -- The pipeline topology (which filters, in what order, with what configuration) is defined declaratively, not hardcoded. This enables dynamic pipeline construction, A/B testing of processing steps, and environment-specific configurations.

## Project Structure

```
src/
+-- pipeline/
|   +-- pipeline.{ext}              # Pipeline builder / executor
|   +-- pipe.{ext}                  # Data channel between filters
|   +-- config.{ext}               # Pipeline configuration loader
+-- filters/
|   +-- input/                      # Source filters (data ingestion)
|   |   +-- csv_reader.{ext}
|   |   +-- json_reader.{ext}
|   |   +-- kafka_consumer.{ext}
|   |   +-- http_poller.{ext}
|   +-- transform/                  # Transformation filters
|   |   +-- field_mapper.{ext}      # Rename/restructure fields
|   |   +-- validator.{ext}         # Validate records against schema
|   |   +-- enricher.{ext}         # Add data from external source
|   |   +-- deduplicator.{ext}     # Remove duplicate records
|   |   +-- aggregator.{ext}       # Group and aggregate records
|   |   +-- normalizer.{ext}       # Normalize values (dates, currencies)
|   +-- output/                     # Sink filters (data output)
|       +-- csv_writer.{ext}
|       +-- database_writer.{ext}
|       +-- elasticsearch_writer.{ext}
|       +-- stdout_writer.{ext}
+-- models/
|   +-- record.{ext}               # Standard data record type
|   +-- pipeline_config.{ext}      # Pipeline definition model
|   +-- filter_config.{ext}
+-- errors/
|   +-- pipeline_errors.{ext}
|   +-- dead_letter.{ext}          # Failed record handling
tests/
+-- unit/
|   +-- filters/
|   |   +-- field_mapper_test.{ext}
|   |   +-- validator_test.{ext}
|   |   +-- enricher_test.{ext}
+-- integration/
|   +-- pipelines/
|       +-- csv_to_db_pipeline_test.{ext}
+-- fixtures/
    +-- sample_input.csv
    +-- expected_output.json
```

## Agent Instructions

### Filter Interface

Every filter implements a standard interface. The exact shape depends on streaming vs batch:

**Streaming Filter:**
```
interface Filter<In, Out>:
    process(input: In) -> Result<Out>       # Process one record
    flush() -> List<Out>                    # Emit buffered records (optional)

    # Metadata
    name() -> str
    description() -> str
```

**Batch Filter:**
```
interface BatchFilter<In, Out>:
    process(input: List<In>) -> List<Out>   # Process entire batch
```

**Composable Pipeline:**
```
pipeline = Pipeline.create()
    .source(CsvReader("input.csv"))
    .pipe(Validator(schema))
    .pipe(FieldMapper(mapping_config))
    .pipe(Enricher(lookup_service))
    .pipe(Deduplicator(key_field="email"))
    .sink(DatabaseWriter(connection))
    .on_error(DeadLetterWriter("errors.log"))
    .build()

pipeline.run()
```

### Creating a New Filter

1. **Implement the filter interface** in the appropriate subdirectory (`input/`, `transform/`, `output/`).
2. **Accept configuration through the constructor** -- field names, thresholds, connection details. No hardcoded values.
3. **Handle errors gracefully** -- Return `Result` types or use error channels. Never throw unhandled exceptions that crash the pipeline.
4. **Write unit tests** with simple input/output pairs. Each filter should be testable in complete isolation.
5. **Document the filter** with: what it does, what configuration it accepts, what input it expects, and what output it produces.

### Standard Record Format

Define a standard record type that flows through the pipeline:

```
class Record:
    data: Map<str, Any>           # The actual data fields
    metadata: RecordMetadata      # Processing metadata

class RecordMetadata:
    source: str                   # Where this record originated
    timestamp: DateTime           # When it was ingested
    pipeline_id: str              # Which pipeline is processing it
    errors: List<ProcessingError> # Errors accumulated during processing
    tags: Map<str, str>           # Filter-applied tags
```

### Streaming vs Batch Decision

Use **streaming** when:
- Records are independent and can be processed individually.
- Low latency matters (process records as they arrive).
- The dataset is too large to fit in memory.
- The pipeline runs continuously.

Use **batch** when:
- The transformation requires the full dataset (sorting, global deduplication, aggregation across all records).
- The data source is inherently batch-oriented (file uploads, scheduled imports).
- Transaction semantics require all-or-nothing processing.

**Hybrid approach**: Use streaming filters for most stages and batch filters only for stages that require the full dataset. The pipeline executor handles buffering between streaming and batch stages.

### Pipeline Configuration

Define pipelines declaratively:

```yaml
pipeline:
  name: "customer-import"
  source:
    type: csv_reader
    config:
      path: "customers.csv"
      delimiter: ","
  filters:
    - type: validator
      config:
        schema: "customer_schema.json"
    - type: field_mapper
      config:
        mappings:
          "Full Name": "name"
          "E-Mail": "email"
    - type: normalizer
      config:
        fields:
          email: lowercase
          phone: e164
    - type: deduplicator
      config:
        key: "email"
  sink:
    type: database_writer
    config:
      table: "customers"
  error_handler:
    type: dead_letter_writer
    config:
      path: "failed_records.json"
```

### Naming Conventions

- **Filter files**: Descriptive noun or verb phrase -- `csv_reader`, `field_mapper`, `validator`, `deduplicator`.
- **Filter classes**: PascalCase -- `CsvReader`, `FieldMapper`, `Validator`, `Deduplicator`.
- **Source filters** go in `filters/input/`. **Transformation filters** in `filters/transform/`. **Sink filters** in `filters/output/`.
- **Pipeline configs**: `{purpose}_pipeline.{yaml|json}` -- `customer_import_pipeline.yaml`.

## Common Pitfalls

1. **Filters with Hidden State** -- A filter that accumulates records internally and changes behavior based on what it has seen (without making this explicit in its interface) breaks composability and makes testing unpredictable. If a filter needs state (e.g., deduplication), make it explicit and resettable.
2. **Overly Specific Filters** -- A filter that handles one exact data format for one exact use case cannot be reused. Build configurable, general-purpose filters (e.g., `FieldMapper` with a config, not `RenameCustomerEmailColumn`).
3. **No Error Channel** -- Silently dropping records that fail processing. Every pipeline must have an explicit error handling strategy: dead-letter queue, error log, or error markers on records.
4. **Tight Coupling Between Filters** -- Filter B assumes Filter A has already run and relies on fields that only Filter A creates. Filters should be self-contained. If a filter requires specific input fields, validate their presence and fail clearly.
5. **Ignoring Backpressure** -- A fast source overwhelming a slow sink. In streaming pipelines, implement backpressure: the pipe between filters should signal the upstream filter to slow down when the downstream filter cannot keep up.

## Platform-Specific Notes

### Unix Shell

- The original pipe and filter system. `cat input.csv | grep -v "^#" | cut -d, -f1,3 | sort | uniq > output.csv`.
- Each Unix command is a filter. Pipes (`|`) connect them. Standard in/out is the interface.
- Use this as a mental model, even when implementing in application code.

### Python

- Generators are natural filters: `yield` output as input streams in. Chain generators for streaming pipelines.
- Libraries: `Apache Beam` for large-scale pipelines, `Luigi` for batch workflows, `Prefect` for modern orchestration.
- Use `itertools` for common transformations (groupby, chain, islice).

### Java / Kotlin

- Java Streams API provides filter/map/reduce for in-memory pipelines.
- Apache Kafka Streams for distributed streaming pipelines.
- Spring Batch for batch processing with step-based pipelines.
- Apache Beam (Java SDK) for unified batch and streaming.

### Rust

- Iterator chains are zero-cost pipe-and-filter pipelines: `.iter().filter().map().collect()`.
- For streaming, use `tokio::sync::mpsc` channels as pipes between async filter tasks.
- For large-scale streaming, use `rdkafka` with Kafka or `async-stream` for custom sources.

### Go

- Goroutines and channels are a natural fit for concurrent pipe-and-filter.
- Each filter runs in a goroutine, reading from an input channel and writing to an output channel.
- Use `context.Context` for cancellation and timeout propagation through the pipeline.

### TypeScript / Node.js

- Node.js Streams (Readable, Transform, Writable) implement pipe-and-filter natively.
- `pipeline()` from `stream/promises` connects streams with proper error handling and backpressure.
- For ETL, consider `node-etl` or write custom Transform streams.

### Compiler/Language Tooling

- Classic pipe-and-filter application: Source -> Lexer -> Parser -> AST Transforms -> Optimizer -> Code Generator.
- Each stage produces an intermediate representation consumed by the next.
- Stages can be independently tested with snapshot tests of their intermediate output.
