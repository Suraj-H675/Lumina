# Production manifests

Phase 0C3 defines the production validation boundary but approves no real source, dataset, or asset
manifest. This empty manifest set is valid. Fictional contract fixtures live only under
`apps/api/tests/fixtures` and must never be copied or selected here as production data.

Later reviewed phases may add one canonical JSON object per file directly below these logical
directories:

```text
sources/  one SourceManifest per file
data/     one DataManifest per exact dataset release
assets/   one AssetManifest per file
```

Do not create those directories merely as placeholders. When manifests are approved, files must
use UTF-8 JSON, lexically sorted keys, two-space indentation, unescaped Unicode, finite JSON values,
and one trailing newline. The read-only `pnpm manifests:check` command rejects noncanonical files,
unknown schema fields or versions, duplicate identities, unsafe paths, and data releases whose
source manifest is absent. It never dereferences manifest URLs or paths and never rewrites files.
