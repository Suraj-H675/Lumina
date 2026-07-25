# Scientific and Content Integrity Rules

## 1. Truth categories

Every claim belongs to one category:

### Observed or measured

Directly derived from observation with source, method, and uncertainty when available.

### Calculated

Derived deterministically from stated inputs and algorithm version.

### Estimated

A value inferred from models or incomplete data.

### Model or simulation

Output conditional on assumptions.

### Hypothesis or interpretation

Scientifically proposed explanation with appropriate strength.

### Unknown

Not measured or unresolved.

### Disputed

Credible sources disagree or classification remains unsettled.

The UI must not flatten these categories.

## 2. Units

- Use Astropy units internally where unit mistakes are plausible.
- Store original unit.
- Convert for display only.
- Never mix radius and diameter.
- Never mix mass units without label.
- Distinguish light-year, parsec, AU, and light travel time.
- Angles: degrees for public API unless specified; hour-angle display may be derived.
- Dates: distinguish UTC, TT/TDB when relevant to ephemerides.
- Significant figures should reflect source precision.

## 3. Uncertainty

When source provides uncertainty:

- retain asymmetric bounds;
- display meaningful rounding;
- avoid false precision;
- explain confidence/quality flags in Deep Dive.

If uncertainty is unavailable, do not invent one.

## 4. Conflicting values

- Show selected display value and source.
- Deep Dive lists alternatives.
- Selection rule is documented.
- Editorial override requires reason and reviewer.
- Never average values casually.

## 5. Derived quantities

Every derived quantity has:

- algorithm ID;
- version;
- inputs;
- units;
- valid domain;
- numerical tolerance;
- test references;
- generated timestamp where inputs change.

## 6. Observation language

Say:

- “astronomically well placed”;
- “expected to be above 30°”;
- “weather permitting”;
- “approximate best window.”

Do not say:

- “guaranteed visible”;
- “you will see this detail”;
- “live position” without timestamp;
- “safe” when relevant conditions are unknown.

## 7. Exoplanet language

- Confirmed versus candidate is explicit.
- Habitable zone does not equal habitable.
- Habitability is not a percentage.
- Atmosphere is unknown unless measured evidence exists.
- Artist concepts are labelled.
- Missing mass/radius is unknown, not Earth-like by default.
- Composite archive values are identified as composite.

## 8. Black holes and relativity

- Visuals are models.
- Avoid “sucking” explanations.
- Distinguish event horizon, singularity prediction, photon sphere, accretion disk, and gravitational lensing.
- Time-dilation examples state observer frames.
- Do not represent the interior of an event horizon as observed fact.

## 9. Cosmology

- State model assumptions when discussing universe age, expansion, dark matter, dark energy, inflation, or observable-universe size.
- Distinguish observable universe from entire universe.
- Avoid implying expansion is motion through pre-existing space.
- Historical timelines identify evidence and uncertainty.

## 10. Images

Every image is classified and credited.

False color must explain mapped wavelengths/colors where practical.

Composite images list instruments/bands when available.

Do not use generated imagery as evidence. The baseline project contains no generative-image pipeline.

## 11. Educational writing

Authored copy should:

- lead with a clear answer;
- avoid unnecessary jargon;
- define necessary terms;
- use analogies with limits;
- connect to a real object/observation;
- state unknowns;
- offer deeper detail;
- cite sources.

Avoid:

- sensational clickbait;
- absolutes unsupported by evidence;
- anthropomorphism that becomes misleading;
- copied encyclopedia prose;
- presenting theories as guesses.

## 12. Content review states

- draft
- science review required
- editorial review required
- ready
- published
- needs update
- archived

Published content requires:

- named/recorded reviewer identity or maintainer handle;
- sources;
- review date;
- content version;
- no unresolved blocking markers.

## 13. Content files

Each structured content file includes:

```yaml
id:
slug:
title:
content_type:
language:
status:
version:
audience_modes:
concept_ids:
entity_ids:
learning_objectives:
prerequisites:
sources:
reviewed_by:
reviewed_at:
updated_at:
```

Mode-specific prose is authored separately. Do not automatically shorten one mode at runtime.

## 14. Source quality hierarchy

Prefer:

1. peer-reviewed papers and official mission/archive documentation;
2. government/intergovernmental science agencies;
3. observatories and universities;
4. established textbooks/open educational resources;
5. reputable secondary science communication.

Blogs, videos, and general news may provide leads but are not the sole source for scientific claims.

## 15. Current events

A discovery entry must distinguish:

- paper/preprint/publication;
- press release;
- mission update;
- independent confirmation status;
- event date versus publication date.

No automated news summary is published without review.

## 16. Safety content

Solar observation:

- certified solar filter;
- filter placed at objective/front, not only eyepiece;
- inspect damage;
- never use eclipse glasses with optical instruments;
- include official safety source.

Night observation:

- surroundings, weather, traffic, wildlife, and permission;
- minors should involve a responsible adult where appropriate;
- no precise public sharing of private home/school location.

## 17. Scientific validation

Critical calculations require:

- known reference cases;
- cross-check with at least one independent trusted tool/source;
- regression fixture;
- tolerance;
- date/range limitations.

Validation results are documented in tests or `data/manifests/science-validation`.
