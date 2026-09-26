# Quality status

## Automated repository state

The current `main` branch is expected to pass the repository's complete automated CI suite: Python/PostgreSQL acceptance, web production build and Chromium E2E, dependency/secret security, repository acceptance, and the aggregate gate.

Do not infer future CI success from this document; verify the exact commit when making a release/deployment claim.

## Phase-8D evidence

Tracked evidence under `data/audits/` remains active. The current quality audit intentionally stays open until real external/manual evidence is available.

Outstanding evidence categories are:

1. human WCAG 2.2 AA review;
2. real screen-reader review;
3. manual native 200% browser-zoom/reflow review;
4. representative low-end physical-device review;
5. approved aggregate field-INP evidence from a real deployment.

Automated WebGL-disabled, reduced-motion, offline, performance, supporting browser-zoom, WWT cadence, and GPU-memory checks do not replace the evidence above.

## Claim rule

If an observation was not actually performed, record it as pending/unavailable/inconclusive rather than converting automated coverage into a manual pass.
