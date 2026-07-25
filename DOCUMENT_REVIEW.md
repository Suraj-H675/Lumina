# Documentation Review and Manifest

Review date: 2026-07-25

## Package summary

- Authored Markdown files reviewed: 41
- Total words: 27,278
- Total UTF-8 bytes: 198,366
- Broken internal Markdown links: 0
- Unbalanced fenced code blocks: 0
- Files missing an H1 heading: 0
- Trailing-whitespace findings: 0
- Tab-character findings: 0

## Consistency checks

The review confirmed the following decisions remain consistent across the pack:

- Product name is Lumina.
- This is a clean rebuild, not an alteration of the old prototype.
- The architecture is a modular monolith: Next.js, FastAPI, PostgreSQL, and one worker.
- No LLM, generative-AI assistant, embedding search, or AI-wrapper dependency is allowed.
- Core functionality uses no paid API.
- Scientific data requires provenance, units, freshness, uncertainty when available, and explicit measurement/model labels.
- Personal data is local-first.
- No public social network is planned.
- Provider adapters, server-side caching, phase gates, accessibility fallbacks, and private plate-solving uploads are mandatory.
- The complete feature vision is preserved in `docs/25_FEATURE_INVENTORY.md`.
- The allowed implementation order is preserved in `docs/18_IMPLEMENTATION_ROADMAP.md`.
- Phase 0 exact bootstrap requirements are in `docs/31_BOOTSTRAP_SPEC.md`.
- Release 1 initial catalog targets are in `docs/32_INITIAL_CATALOG_SCOPE.md`.

## Research basis checked

The architecture and provider guidance was written against current official documentation available during the review, including:

- Next.js App Router and upgrade documentation
- FastAPI documentation and version guidance
- NASA Exoplanet Archive TAP documentation
- ESA Gaia Archive documentation
- SIMBAD/CDS documentation
- NASA/JPL SSD Horizons API and fair-use documentation
- Astrometry.net API/self-hosting documentation
- WorldWide Telescope WebGL documentation
- NOAA SWPC machine-readable products
- CelesTrak GP data pages
- NASA APIs, Image Library, and Citizen Science pages

Provider terms, schemas, quotas, and releases must still be re-verified when each adapter is implemented.

## Important boundary

This review validates the documentation package's structure and internal consistency. It does not certify future implementation code, scientific calculations, provider availability, licensing decisions, or public-deployment legal compliance. Those are controlled by the tests, reviews, source manifests, and phase gates defined in the documents.

## File manifest

| File | Words | Bytes | SHA-256 |
|---|---:|---:|---|
| `AGENTS.md` | 1,613 | 10,795 | `9e464cce2494eaa2e136d79928aaf8ad3531f68ff25eeee65ebe57172a3f16b2` |
| `CHANGELOG.md` | 49 | 350 | `b2526525e9661739ed204ee033ad3aadc1d988d5cc4b8048da642c92015d4cfb` |
| `CODE_OF_CONDUCT.md` | 116 | 905 | `1723a990513db0b6cc057ce7c2c4f685eadae33340e9a56cee10805e1ce7e7b9` |
| `CONTRIBUTING.md` | 363 | 2,657 | `02cbc07362d2c72165cc79e6142823c340a441752cf5e2a90a2b429c7e54a2f1` |
| `PLAN.md` | 941 | 6,652 | `4bf95c47338ba35c5e67f35b9997f2fc2f4ff734b055a42de89537d598577b5b` |
| `README.md` | 307 | 2,424 | `cd3c1b3fd64752fbe6119a3569dc713bb58b245527e0789a44074ccf1baae933` |
| `SECURITY.md` | 197 | 1,393 | `816320e4187b3ba1fa6a03bcc464a1e6f86d1f1016c6284994f5a6421a067ba6` |
| `docs/00_SOURCE_OF_TRUTH.md` | 761 | 5,194 | `b1d073877e668ce8dbb8b2363e3d72ce0ae8f21ec76a7819cfb2864b7006a62b` |
| `docs/01_PRODUCT_SPEC.md` | 990 | 6,990 | `25eab7eeb0b294f28b5372df6adaae470bc81447df9995541cdfba5f89a54ac6` |
| `docs/02_INFORMATION_ARCHITECTURE.md` | 356 | 2,968 | `ca1516de4a1f70abead802ed9bdedfc4e3edd41301f8300dc08d04bac6111faf` |
| `docs/03_ARCHITECTURE.md` | 843 | 5,991 | `8af053af5650427923fbcb8453a170f8d8d07b916ef50d03ca6a1b7042ea2d10` |
| `docs/04_TECH_STACK.md` | 425 | 3,002 | `f8fdd335e35c8cafc98dcd8d39596f2c096b9e0f3e8ac17e28a7d75e01445f45` |
| `docs/05_REPOSITORY_STRUCTURE.md` | 394 | 3,454 | `804f89232a6ba0f3ade231a80e9e97074ba7cd4a24ca79516284b8aadc77539c` |
| `docs/06_DATA_SOURCES.md` | 1,269 | 9,563 | `ddcdfa7b1d991351a5119f604e497c561bdd4b1a50febcd07c3f23e6b7143fc1` |
| `docs/07_DATA_MODEL.md` | 1,024 | 8,226 | `a7feea5ef96202ea8a592e58e12f37321ddb6e28c8ce04110d14d4e93e5ec392` |
| `docs/08_API_SPEC.md` | 812 | 6,770 | `95788d68e0e7b1a5bace36aa41166ee0cebdf514c088e8a06b14dce2afdbeeb6` |
| `docs/09_FRONTEND_SPEC.md` | 981 | 6,749 | `8b83776366a49b4a58a14ac312421b2699b4d2528046647ae62a4eeee63e33d1` |
| `docs/10_DESIGN_SYSTEM.md` | 673 | 4,678 | `7aacd6c0b4d910d7ee39bbf8d9b80a7a5e5ada98d9ac8718fd83abb00c86a637` |
| `docs/11_SCIENCE_CONTENT_RULES.md` | 820 | 5,922 | `2ae793ddc600d06e1147092215d9809d432857454ffd546652403ef2a2b5d56a` |
| `docs/12_OBSERVABILITY_ENGINE.md` | 1,164 | 8,419 | `05542d9013e9fd24f7bddc675d80fedc584488c775fa5b3c57b810196d95377f` |
| `docs/13_SIMULATIONS.md` | 1,024 | 7,289 | `114f4980937828e69638e8da7f46aa6982eeb14a1a41112a0d87e53766cdbea3` |
| `docs/14_IMAGE_IDENTIFICATION.md` | 616 | 4,294 | `8b09780724fcad0f7a1f38b70283f91611131d6fa81973357002070192738357` |
| `docs/15_SECURITY_PRIVACY.md` | 856 | 5,951 | `277a349e3066b185ee939c20bdafb6f33a4c5648258a414c02bd470c97d3bfb9` |
| `docs/16_TESTING_QUALITY.md` | 795 | 5,327 | `44e130e9ce775c9fb419d71dc50e82bdfbde49e03634d619d1349e5502abe3c0` |
| `docs/17_DEPLOYMENT_OPERATIONS.md` | 753 | 5,194 | `c1e4453550aa7bc1100288e532b42f502ab0b72a3456a357db7474b7953d8345` |
| `docs/18_IMPLEMENTATION_ROADMAP.md` | 1,902 | 13,186 | `9349ce02c3b18686048f6a72c92b16beecae76060cc9833c6fa34a63febf8709` |
| `docs/19_DECISIONS.md` | 504 | 3,981 | `b9dbcad183d38136b63c47506d89b0910ad91409a77c650bb8f995e8dd19861f` |
| `docs/20_RISK_REGISTER.md` | 635 | 5,253 | `ec866dd0048c3ff61364e0a35ad8595e35f833ea311a700508a438d505ddb995` |
| `docs/21_GLOSSARY.md` | 694 | 5,459 | `7cb92ebda9dd686537c645e7fcfa9e5f28ae677c7468c88959e9b4d49df138fa` |
| `docs/22_ATTRIBUTION_AND_LICENSING.md` | 564 | 4,630 | `52acfc82a13dd9bc0095c54c61edf246d1f5c7caead5d0007d29a080c838a657` |
| `docs/23_ENVIRONMENT_VARIABLES.md` | 279 | 3,821 | `5fab69d7f11f705a85d1801d3b3dd1ca099b272f9ef9ab586208f9e78312e37e` |
| `docs/24_DEFINITION_OF_DONE.md` | 417 | 2,938 | `c9291cb21c640b43772e7b66bb113bf638eb212760f9f3bda331ff5dc34d0a3f` |
| `docs/25_FEATURE_INVENTORY.md` | 562 | 3,797 | `f6838146dbe2d753a1b439ce04397c477afed9b71e7eed535e181a16613549e1` |
| `docs/26_CONTENT_SCHEMA.md` | 345 | 2,698 | `f23826afb40b6379a6ebd10e4676d99e262c7605527f1140ac448bd418b6f974` |
| `docs/27_PROVIDER_ADAPTER_TEMPLATE.md` | 410 | 2,797 | `47e1ad0b4124171e053aa8899888a9daa55c93991d789ad9b7d0d05ca733231f` |
| `docs/28_CODEX_TASK_PROTOCOL.md` | 485 | 3,271 | `7de9717a57d86f87093e7f83689ce21e63b1ddc882bb22cf1bbbe74ea94279ae` |
| `docs/29_UI_COPY_STYLE.md` | 390 | 2,432 | `4037a13fa7b71238633b29877346d30588cf7b1ab4c88b8464541376ac9bdebf` |
| `docs/30_KNOWN_LIMITATIONS.md` | 386 | 2,717 | `d18060215b8c34000fafdd942ca7bf510e1779151465f4b043332c533f85f7cc` |
| `docs/31_BOOTSTRAP_SPEC.md` | 622 | 4,215 | `66284fcbb8be53385ba9d3a00fe006db18f220122a210b1f6a21764b23ed469c` |
| `docs/32_INITIAL_CATALOG_SCOPE.md` | 799 | 4,565 | `b97dcf28067b940ee5ca342ed960044f543f3456553f822ce66a567c207f74c3` |
| `docs/README.md` | 142 | 1,449 | `58ec1d41c595f7a992fdef4ccc19bf3f6de4ea664f5f2a950880aa0616bbef41` |
