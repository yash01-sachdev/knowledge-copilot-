# Next Upgrades

## Good next upgrades after the current v1

### 1. Authentication

Add user accounts so each person gets:

- a private note base
- isolated feedback history
- per-user sync settings

### 2. Production database

Move the storage layer from SQLite to Postgres plus `pgvector` when you want:

- better concurrency
- easier cloud persistence
- vector search in the main database

### 3. Background jobs

Shift expensive work out of the request cycle:

- embedding generation
- graph rebuilding
- recurring-theme recomputation
- large folder sync imports

### 4. Observability

Add:

- structured logs
- latency dashboards
- failure tracing
- answer quality monitoring

## Suggested build order

1. deploy current v1
2. add auth
3. move to Postgres
4. add background jobs
