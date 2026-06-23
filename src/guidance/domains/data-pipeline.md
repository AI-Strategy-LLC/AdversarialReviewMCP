+++
display_name = "Data Pipeline"
applies_to = ["data-engineering", "etl", "elt", "streaming", "batch", "analytics", "data-warehouse", "spark", "kafka", "airflow"]
+++

# Data Pipeline Domain Guidance

## Characteristics

Data pipelines move, transform, and validate data between systems. They range from
simple scheduled scripts to complex distributed streaming architectures. The defining
challenges are reliability (data must not be lost or duplicated), observability
(operators must know the state of every pipeline), and evolution (schemas and
business logic change over time without breaking downstream consumers).

Key architectural decisions:
- **Batch**: Process data in scheduled intervals (hourly, daily). Simpler to build and debug. Best for analytics, reporting, and data warehouse loading. Tools: Airflow, dbt, Spark.
- **Streaming**: Process data as it arrives in near-real-time. Required for event-driven architectures, real-time dashboards, and time-sensitive actions. Tools: Kafka, Flink, Spark Streaming.
- **ETL** (Extract-Transform-Load): Transform data before loading into the target. Traditional approach. Good when the target system has strict schema requirements.
- **ELT** (Extract-Load-Transform): Load raw data first, transform in the target. Modern approach using data warehouse compute (dbt + BigQuery/Snowflake). More flexible for exploratory analysis.
- **Hybrid**: Most production systems combine batch and streaming. Lambda architecture (batch + streaming layers) or Kappa architecture (streaming only with replay) depending on latency requirements.

## Key Conventions

- **Idempotency is non-negotiable.** Every pipeline stage must produce the same result when run multiple times with the same input. Use upserts, not inserts. Partition output by processing time. This enables safe retries and backfills.
- **Schema evolution must be planned.** Use a schema registry (Confluent, AWS Glue) for streaming. Use migration tools (dbt, Alembic) for warehouses. Support adding columns, renaming with aliases, and deprecating fields without breaking downstream.
- **Partition data by time.** Store data partitioned by ingestion date or event date. This enables efficient backfills, time-range queries, and data retention policies.
- **Validate data at ingestion.** Check for nulls in required fields, type correctness, value ranges, referential integrity, and unexpected duplicates. Quarantine bad records rather than dropping them silently.
- **Track data lineage.** Document where each field comes from, what transformations are applied, and where it goes. Use tools like dbt docs, OpenLineage, or Marquez.
- **Monitor data freshness and quality.** Track when each table was last updated. Alert when freshness exceeds SLA. Monitor row counts, null rates, and value distributions for anomalies.

## Project Structure

```
pipelines/
├── dags/                    # Airflow DAG definitions
│   ├── daily_load.py
│   ├── hourly_events.py
│   └── weekly_aggregation.py
├── dbt/                     # dbt transformation project
│   ├── models/
│   │   ├── staging/         # 1:1 with source tables, light cleaning
│   │   ├── intermediate/    # Business logic transformations
│   │   └── marts/           # Final consumption-ready tables
│   ├── macros/              # Reusable SQL macros
│   ├── tests/               # Data quality tests
│   ├── snapshots/           # Slowly changing dimension tracking
│   └── dbt_project.yml
├── schemas/                 # Schema definitions
│   ├── avro/                # Avro schemas for streaming
│   ├── protobuf/            # Protobuf schemas if using gRPC
│   └── json-schema/         # JSON Schema for validation
├── streaming/               # Streaming pipeline code
│   ├── consumers/
│   ├── producers/
│   └── processors/
├── quality/                 # Data quality checks
│   ├── great_expectations/  # Expectation suites
│   └── monitors/            # Freshness and anomaly monitors
├── scripts/                 # Operational scripts
│   ├── backfill.py          # Historical data reprocessing
│   └── repair.py            # Data repair utilities
└── tests/
    ├── unit/                # Transform logic tests
    ├── integration/         # End-to-end pipeline tests
    └── fixtures/            # Sample input/output data
```

## Agent Instructions

1. **Map the data flow end-to-end before writing code.** Draw the source systems, extraction points, transformation steps, and target systems. Identify data owners, update frequencies, and SLAs for each source.
2. **Build the staging layer first.** Create 1:1 staging models for each source table with minimal transformation: type casting, column renaming, and deduplication. This isolates downstream models from source schema changes.
3. **Make every transformation idempotent.** Use `MERGE` or `INSERT OVERWRITE PARTITION` instead of `INSERT INTO`. Parameterize by date range so any time window can be reprocessed.
4. **Implement data quality checks before building features.** Define expectations for every table: not-null constraints, uniqueness, accepted value ranges, referential integrity. Fail the pipeline when critical checks fail. Warn for non-critical anomalies.
5. **Build backfill capability from day one.** Every pipeline should accept a date range parameter and correctly reprocess historical data. Test backfill in staging before the first production run.
6. **Use incremental processing where possible.** Do not reprocess the entire dataset on every run. Process only new or changed records. Use watermarks, change data capture, or modified timestamps to identify deltas.
7. **Document every model.** Each dbt model or transformation should have a description, column descriptions, source documentation, and known caveats. This is the data catalog.
8. **Alert on data quality, not just pipeline failures.** A pipeline can succeed while producing garbage data. Monitor row counts, null rates, value distributions, and freshness. Alert when metrics deviate from expected ranges.

## Testing Strategy

- **Unit tests**: Test transformation logic with known input/output pairs. Test SQL with dbt tests or by running against a test database.
- **Schema validation tests**: Verify that input data matches expected schemas before processing. Test schema evolution paths.
- **Data quality tests**: Assertions on output data (not-null, uniqueness, foreign keys, value ranges). Run as part of the pipeline.
- **Integration tests**: Run the full pipeline against a test dataset and verify the end state. Compare output tables to expected snapshots.
- **Backfill tests**: Run the pipeline for a historical date range and verify idempotency by running it twice and comparing results.
- **Performance tests**: Measure processing time and resource usage. Set budgets for critical pipelines. Test with production-scale data volumes.

## Common Pitfalls

- **Silent data loss**: Filtering out bad records without logging or quarantining them. Always route rejected records to a dead-letter table with the rejection reason.
- **Non-idempotent pipelines**: Appending to a table without deduplication causes row multiplication on retry. Every write must be idempotent.
- **Schema drift without detection**: Source systems change schemas without notice. Monitor source schemas and alert on unexpected changes. Use schema contracts where possible.
- **Untested backfill paths**: The first time you need to reprocess 6 months of data should not be during an incident. Test backfill regularly.
- **Tight coupling to source systems**: Querying production databases directly for extraction puts load on transactional systems and couples your pipeline to their schema. Use change data capture, replicas, or exported files.
- **No data freshness monitoring**: Downstream dashboards show stale data and nobody notices for days. Monitor the last-updated timestamp of every critical table and alert when freshness exceeds the SLA.
- **Overwriting historical data**: Mutating previously-written partitions without audit. Use append-only or snapshot patterns to preserve data history. Overwrite only with explicit backfill operations that are logged.
- **Running development pipelines against production data**: Use anonymized or synthetic data for development and testing. Production data access should be restricted and audited.
