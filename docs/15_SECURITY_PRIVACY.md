# Security and Privacy

## 1. Privacy model

Lumina is local-first and data-minimizing.

The baseline product does not require:

- account;
- real name;
- date of birth;
- phone number;
- advertising identifier;
- public profile.

## 2. Data classification

### Public

Catalog, lessons, simulations, provider summaries, approved media.

### Local private

Interests, locations, equipment, progress, collections, plans, journal, dashboard preferences.

### Server temporary private

Identification uploads, job metadata, optional exact location submitted for a calculation.

### Secret

Provider keys, database credentials, signing keys, storage credentials.

## 3. Location

- Request browser location only after a user action.
- Explain purpose.
- Manual coordinates are always available.
- Store saved locations in IndexedDB.
- Default server requests use coordinates transiently and do not persist them.
- Do not log coordinates.
- Shared links omit exact location unless user explicitly chooses a rounded/approximate location.
- Provide location deletion.

## 4. Children and teens

Design for safety without collecting age:

- no public comments/messages;
- no discoverable profiles;
- no precise public observation locations;
- no targeted advertising;
- no behavioral tracking;
- no manipulative streak pressure;
- no external link opened without clear destination;
- citizen-science links show external-site notice.

Legal compliance for a public deployment must be reviewed for the operating jurisdiction. The codebase must not claim legal compliance merely from these design choices.

## 5. Uploads

- private by default;
- explicit remote-processing consent;
- MIME signature validation;
- size and pixel limits;
- EXIF stripping;
- random keys;
- signed URLs;
- processing sandbox;
- retention deadline;
- deletion endpoint;
- no content indexing;
- no public gallery.

## 6. API security

- environment-based CORS allowlist;
- trusted proxy configuration;
- request body limits;
- timeouts;
- rate limits;
- validation;
- stable safe errors;
- CSRF protection where cookie-authenticated state is later introduced;
- no secrets in client bundles;
- security headers;
- HTTPS production requirement.

Baseline anonymous local-first APIs should not create server sessions unnecessarily.

## 7. Headers

Production target:

- Content-Security-Policy
- Strict-Transport-Security
- X-Content-Type-Options: nosniff
- Referrer-Policy
- Permissions-Policy
- frame-ancestors through CSP
- secure cache headers by sensitivity

CSP must account for approved visualization workers and media hosts. Avoid broad `unsafe-eval`.

## 8. Dependency security

CI:

- lockfile integrity;
- npm audit/advisory review;
- Python vulnerability scan;
- GitHub dependency review;
- secret scanning;
- CodeQL where practical;
- container scan;
- licence scan.

A vulnerability is triaged by exploitability and affected path, not ignored solely because it is transitive.

## 9. Database

- least-privilege runtime role;
- separate migration role when production permits;
- parameterized queries;
- migrations reviewed;
- encrypted transport;
- backups protected;
- no public exposure;
- raw provider payloads reviewed for unexpected personal data.

## 10. Provider secrets

- server environment/secret store;
- never `.env` committed;
- `.env.example` contains names only;
- rotation documented;
- logs redact;
- provider adapters never return credentials;
- NASA `DEMO_KEY` prohibited in production.

## 11. Job security

- validate job type and payload;
- no arbitrary module/function invocation;
- bounded retries;
- payload size limit;
- no shell command construction from user input;
- worker uses least privilege;
- plate solver isolated;
- expired jobs cleaned.

## 12. Local export/import

Export may contain private location/journal data.

- show warning before export;
- no automatic upload;
- validate JSON schema;
- size limit;
- prototype-pollution-safe parsing;
- preview changes;
- reject unknown executable content;
- preserve backup before destructive merge where feasible.

## 13. Logging

Allowed:

- request ID;
- route template;
- status;
- duration;
- coarse error code;
- provider name;
- job ID;
- data freshness.

Forbidden:

- exact query when sensitive;
- coordinates;
- journal text;
- filenames if sensitive;
- image bytes;
- access tokens;
- API keys;
- database URLs;
- full provider response containing secrets.

## 14. Analytics

No third-party analytics baseline.

If privacy-preserving analytics are later added:

- explicit decision;
- no advertising;
- no cross-site tracking;
- no exact location;
- no private page content;
- documented opt-out;
- self-hosted/free preference.

## 15. Threat cases

Required threat review:

- malicious image upload;
- decompression bomb;
- path traversal;
- SSRF through provider/media URL;
- API quota exhaustion;
- job queue abuse;
- SQL injection;
- XSS from content/provider fields;
- malicious imported local-data file;
- stale/poisoned provider cache;
- forged source attribution;
- secret leak into generated client;
- WebGL denial of service;
- dependency supply-chain compromise.

## 16. Incident readiness

Document:

- secret rotation;
- provider disable switch;
- upload service disable switch;
- data-source rollback;
- migration rollback/restore;
- user-facing status message;
- vulnerable asset removal;
- cache purge.

## 17. Retention

Baseline temporary upload retention: configurable, default 24 hours after terminal job unless user explicitly saves a local copy/reference. Production policy must be displayed.

Job metadata may be retained longer for aggregate reliability metrics only after private fields are removed.

## 18. Security acceptance

A feature handling location, uploads, imports, external URLs, or secrets is incomplete without:

- threat cases;
- validation tests;
- rate/resource limits;
- safe logs;
- deletion/cleanup;
- error behavior;
- documentation.
