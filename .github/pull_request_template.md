## Scope

- Roadmap phase and task:
- User or engineering outcome:
- Explicitly out of scope:

## Evidence

- Architecture, science, data, or provider decisions:
- Scientific sources, units, assumptions, and tolerances (when applicable):
- Data/media provenance and licence review (when applicable):
- Migration, generated-contract, cache, rollback, and cost impact:

## Verification

List the exact commands run and their results. Do not claim a skipped check passed.

- [ ] Formatting and lint
- [ ] Static type checks
- [ ] Unit and relevant integration tests
- [ ] Migration upgrade/downgrade checks, or not applicable with reason
- [ ] Production web build and relevant Playwright tests, or not applicable with reason
- [ ] Accessibility checks, or not applicable with reason
- [ ] Documentation, manifest, generated-client, and security gates

## Review

- [ ] The change follows [AGENTS.md](../AGENTS.md) and the active [implementation roadmap](../docs/18_IMPLEMENTATION_ROADMAP.md).
- [ ] No scientific value, source, licence, API field, test result, or deployment result is fabricated.
- [ ] Fixtures remain visibly test-only and cannot enter production.
- [ ] Secrets, exact locations, uploads, and journal content cannot enter logs or artifacts.
- [ ] Known limitations and rollback or follow-up work are documented.

## User interface evidence

For UI changes, include responsive screenshots and summarize keyboard, screen-reader, focus,
reduced-motion, high-contrast, non-WebGL, and low-bandwidth behavior. Otherwise state why this
section is not applicable.
