# Codex Task Protocol

This document tells a coding agent how to execute work without losing project intent.

## 1. Start every task

State internally and in the task report:

- requested outcome;
- active roadmap phase;
- relevant documents;
- affected modules;
- dependencies;
- risks;
- acceptance checks.

Do not begin by generating a broad scaffold unrelated to the requested slice.

## 2. Repository inspection

Before edits:

- `git status`
- current branch/commit
- relevant file tree
- existing tests
- migrations
- package manifests
- recent decisions

Do not overwrite user changes. If the tree is dirty, preserve and identify them.

## 3. Planning granularity

Break work into:

1. data/domain;
2. API/application;
3. frontend;
4. tests;
5. docs;
6. verification.

For a large phase, implement one end-to-end slice first.

## 4. Decision handling

A decision is already made when documented. Do not ask again.

When a genuinely new blocking decision exists:

- state exact issue;
- list implications;
- choose the safest reversible default only if allowed;
- mark it clearly;
- do not fabricate an external fact.

Minor code-level choices should be made consistently without interrupting.

## 5. Implementation

- use existing patterns;
- avoid broad rewrites;
- preserve architecture boundaries;
- add schema before dependent data;
- update generated client after API;
- keep changes buildable;
- no dead code;
- no placeholder “coming soon” unless the phase explicitly requires unavailable state.

## 6. Scientific work

Before code:

- identify source/formula;
- specify units/time/frame;
- valid range;
- uncertainty;
- reference cases;
- tolerance;
- algorithm version.

Then implement pure calculation and tests before UI.

## 7. Provider work

Complete `27_PROVIDER_ADAPTER_TEMPLATE.md` in design notes or PR description. Build with fixtures first. Live smoke is secondary.

## 8. UI work

Implement:

- default;
- loading;
- empty;
- error;
- stale/offline;
- keyboard;
- mobile;
- reduced motion;
- fallback;
- source/limitations.

Screenshots do not replace tests.

## 9. Verification

Run the smallest affected checks during iteration and full required checks before completion.

Record actual commands and outcomes. Never write “all tests pass” from assumption.

## 10. Documentation synchronization

Update:

- README if commands/user behavior changed;
- API spec if contract changed;
- data source/model docs if fields changed;
- decisions for architecture changes;
- roadmap task/gate;
- known limitations;
- environment variables.

## 11. Completion report format

```text
Scope:
Implemented:
Scientific/data basis:
Files/modules:
Verification:
- command — result
Limitations:
Not done:
Next roadmap action:
```

## 12. Stop conditions

Stop the affected work and report when:

- licence is unknown;
- paid dependency is required for core behavior;
- external API schema cannot be verified;
- scientific formula/source is unresolved;
- migration risks data without backup path;
- user private data would be exposed;
- task requires prohibited LLM/generative functionality;
- repository contains conflicting uncommitted user changes that cannot be safely preserved.

Partial safe completion is preferred over fabricated completeness.
