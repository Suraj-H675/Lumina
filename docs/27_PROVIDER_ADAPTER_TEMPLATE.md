# Provider Adapter Template

Copy this section into a provider implementation design before writing the adapter.

## Phase 0C3 boundary

Phase 0C3 defines only this transport-neutral sequence:

```text
typed request
  -> await fetch(request) -> untrusted object
  -> validate_payload(object) -> strict provider payload DTO
  -> normalize(request, payload) -> provider-isolated result
```

The adapter exposes one `SourceManifest`; its capabilities are the sole operation declaration.
Fetch cannot claim a validated payload type, malformed payloads cannot reach normalization, and no
provider payload crosses a public API boundary. The deterministic fictional adapter under tests
implements `lookup` and `batch_fetch` without filesystem or network access.

Timeouts, retries, concurrency, rate limits, pagination, cache execution, credentials, schedules,
provider status, metrics, registries, and real implementations remain Phase 4A. The template below
continues to define that future per-provider design work; its operational entries are not supplied
by the C3 protocol.

## Provider summary

- Provider:
- Dataset/product:
- Purpose in Lumina:
- Official documentation:
- Terms/licence:
- Required attribution:
- Authentication:
- Base URL:
- Contact/user-agent requirement:
- Rate/fair-use policy:
- Last verified date:

## Scope

Fields/features Lumina uses:

Fields/features explicitly not used:

## Public contract isolation

The public Lumina API does not expose the provider payload. Define:

- provider request DTO;
- provider response DTO;
- normalized domain command/result;
- source record mapping;
- measurement mapping.

## Request policy

- timeout:
- maximum concurrency:
- retryable statuses:
- maximum retries:
- backoff:
- rate limiter:
- pagination:
- conditional requests:
- maximum response size:
- user-agent:

## Cache and freshness

- cache key:
- TTL:
- refresh interval:
- stale-while-revalidate:
- maximum acceptable stale age:
- behavior with no cache:
- observed/published timestamp mapping:
- fetch timestamp:

## Schema validation

- expected content type:
- schema/version indicator:
- required fields:
- optional fields:
- unknown-field policy:
- type-coercion policy:
- null policy:
- invalid-record policy:
- batch quarantine policy:

Never coerce a malformed scientific value into a plausible value.

## Identity mapping

- provider record ID:
- canonical match fields:
- aliases:
- ambiguity handling:
- create-new-entity rule:
- merge prohibition/approval:

## Measurement mapping

For each field:

| Provider field | Quantity code | Original unit | Canonical unit | Uncertainty | Quality | Selection eligibility |
|---|---|---|---|---|---|---|

## Provenance

- dataset record:
- source URL/reference:
- publication citation:
- raw payload retention:
- checksum:
- parser version:

## Errors

Map:

- network failure;
- timeout;
- 4xx;
- rate limit;
- 5xx;
- invalid schema;
- empty result;
- partial record;
- provider maintenance.

## Privacy/security

- user data sent:
- exact location sent:
- upload sent:
- secret handling:
- SSRF protection:
- response-size/resource limits:

## Fixtures

Required fixture files:

- success;
- minimal valid;
- missing optional;
- invalid type;
- schema/version change;
- rate limit;
- server error;
- empty;
- duplicate;
- ambiguous identity.

Fixtures must be sanitized and licensed/allowed.

## Operational controls

- enable flag;
- sync command;
- schedule;
- provider status;
- disable procedure;
- last-good rollback;
- metrics;
- alert threshold.

## Acceptance

- official terms verified;
- adapter tests pass;
- no direct browser call;
- public contract unaffected by provider details;
- source drawer works;
- stale/outage behavior verified;
- attribution visible.
