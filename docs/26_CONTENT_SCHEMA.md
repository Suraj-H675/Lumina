# Content Schema

Authored content is stored as MDX or Markdown plus validated front matter. The exact parser is selected during Phase 1C.

## Common front matter

```yaml
id: uuid
slug: unique-kebab-case
title: string
content_type: concept|lesson|path|quiz|myth|story|activity|discovery
language: en
status: draft|science-review|editorial-review|ready|published|needs-update|archived
version: integer
summary: string
audience_modes: [explorer, student, deep-dive]
concept_ids: []
entity_ids: []
learning_objectives: []
prerequisites: []
sources: []
media_ids: []
authors: []
reviewed_by: []
reviewed_at:
created_at:
updated_at:
```

## Source entry

```yaml
- id:
  title:
  organization_or_authors:
  url_or_doi:
  publication_date:
  accessed_at:
  claim_scope:
  source_type:
```

## Concept content

Must include:

- one-sentence definition;
- Explorer explanation;
- Student explanation;
- Deep Dive explanation;
- common misconception;
- examples;
- related concepts;
- sources.

## Lesson

Must include:

- hook;
- objectives;
- prerequisites;
- estimated active time;
- sections;
- interactive references;
- real-object examples;
- misconception check;
- activity;
- knowledge check IDs;
- summary;
- next actions.

## Quiz

```yaml
quiz_id:
lesson_id:
questions:
  - id:
    type: single-choice|multi-choice|ordering|matching|numeric|diagram
    prompt:
    choices:
    correct:
    tolerance:
    unit:
    hint:
    feedback_correct:
    feedback_incorrect:
    explanation:
    concept_ids:
```

Questions and answers are never generated at runtime.

## Learning path

- ordered lessons;
- optional branches;
- prerequisites;
- completion rule;
- mastery concepts;
- capstone activity;
- source/review metadata.

## Myth

- claim;
- verdict;
- concise correction;
- detailed explanation;
- why misconception persists;
- evidence;
- sources.

## Story

- narrative scope;
- fact/fiction boundary;
- timeline;
- entities;
- mode variants;
- sources;
- no invented dialogue presented as historical fact.

## Activity

- age/skill guidance without collecting age;
- materials;
- duration;
- steps;
- safety;
- learning objective;
- expected observation;
- disposal/cleanup;
- adult-supervision note where relevant.

## Discovery

- event date;
- publication/announcement date;
- source type;
- review state;
- summary;
- significance;
- caveats;
- related entities;
- primary source;
- press source optional;
- media credit.

## Validation

CI checks:

- schema;
- unique IDs/slugs;
- valid links;
- source list;
- review metadata;
- quiz correctness;
- prerequisite cycles;
- media manifest references;
- mode requirements;
- dates;
- prohibited unresolved markers in published content.
