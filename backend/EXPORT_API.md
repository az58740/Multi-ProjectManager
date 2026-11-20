# Export API

All endpoints below use the existing project access middleware. A valid session belonging to an **active user** is required; writes also require the configured same-origin `Origin` header. There is currently **no per-project user authorization**: every active user can access every project. The `{code}` path segment is the project's code, not its ID. An unknown code or a project whose type is not `export` returns 404. The server resolves the project ID; the body cannot supply one.

The API returns JSON and `Cache-Control: no-store`. Bodies are limited to 64 KiB and must be a single JSON object with no unknown fields or explicit nulls. Empty lists are `{"items":[]}`. POST returns the created object with HTTP 201. Invalid JSON, values, or supplier references return 400; unexpected storage failures return 500. Authentication or origin failures use the existing middleware's 401/403 responses. Error bodies have the form `{"error":"..."}`.

## Counterparties

`GET /api/v1/projects/{code}/export/counterparties` returns `{ "items": [ ... ] }`.

`POST /api/v1/projects/{code}/export/counterparties` accepts, for example:

```json
{"name":"Example supplier","roles":["supplier","customer"],"phone":"+98...","country":"Iran","notes":""}
```

`name` must be nonblank. `roles` must contain at least one of `supplier`, `customer`, or `intermediary`; multiple roles are allowed. `phone`, `country`, and `notes` are optional strings, defaulting to empty strings. Leading and trailing whitespace is trimmed from text fields. The response has `id`, `projectId`, `name`, `roles`, `phone`, `country`, `notes`, and `createdAt` (RFC 3339 timestamp).

## Shipments

`GET /api/v1/projects/{code}/export/shipments` returns `{ "items": [ ... ] }`.

`POST /api/v1/projects/{code}/export/shipments` accepts, for example:

```json
{"reference":"SHIP-001","supplierId":"cp_...","palletCount":10,"weightKg":"1234.500","destination":"Moscow","status":"planning","notes":""}
```

`reference` must be nonblank. `supplierId` must identify a counterparty in the same project with the `supplier` role; missing, non-supplier, and cross-project IDs all return the same 400 error. `palletCount` must be a positive whole number fitting a signed 64-bit integer. `weightKg` must be a positive decimal **string** of digits with an optional decimal point and at least one digit on both sides when present; signs and exponents are not accepted. No floating-point conversion is used. Leading integer zeroes are normalized and fractional scale is retained, e.g. `"00012.3000"` becomes `"12.3000"`. PostgreSQL NUMERIC limits apply: at most 131072 integer digits and 16383 fractional digits (and the body limit still applies). `destination` and `notes` are optional strings. `status` must be `planning`, `in_transit`, `delivered`, or `sold`. The response has `id`, `projectId`, all input fields, and `createdAt`.

Lists are newest first, with ID as a tie-breaker. Database mode applies `internal/projects/migrations/005_export_core.sql` through the existing migration engine; PostgreSQL stores weights as NUMERIC and enforces project and composite project/supplier foreign keys. Without `DATABASE_URL`, non-production demo mode stores export data in memory until process exit. Production refuses to start without a database.

Run unit tests with `go test ./...`. PostgreSQL integration tests require `TEST_DATABASE_URL` pointing to a disposable database with CREATE SCHEMA permission. The export integration test creates and removes its own schema; the existing auth integration test additionally requires a fresh empty public schema.
