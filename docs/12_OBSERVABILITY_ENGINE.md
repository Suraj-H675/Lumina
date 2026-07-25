# Observability Engine Specification

This engine answers: “Can this object be observed from this location and time, and when is the best window?”

It is deterministic. It does not use weather prediction as a substitute for astronomical visibility.

## 1. Inputs

Required:

- latitude degrees [-90, 90];
- longitude degrees [-180, 180], east positive;
- elevation meters, default 0 if unknown and clearly marked;
- IANA time zone;
- date/time range;
- target canonical entity and coordinate/ephemeris source;
- target type;
- equipment profile;
- user constraints.

Optional:

- horizon mask;
- Bortle class;
- weather;
- minimum altitude;
- minimum duration;
- Moon-separation threshold;
- target priorities.

## 2. Time handling

- Parse user-local time using IANA zone.
- Convert to UTC.
- Use Astropy `Time` with explicit scale.
- Ephemeris computations use the required scale internally.
- Return UTC and local representation.
- Handle DST ambiguous/nonexistent times explicitly.
- Reject times outside ephemeris/catalog propagation support.

## 3. Target position

### Fixed/deep-sky objects

- Start with ICRS position and epoch.
- Apply proper motion/parallax/radial velocity when available and material.
- Record whether propagation occurred.
- Transform to AltAz at each sample.

### Solar System objects

- Use selected local ephemeris through Skyfield/Astropy.
- Include apparent position/light-time corrections as defined by implementation.
- Record ephemeris kernel/version.

### Satellites

- Use fresh OMM/TLE and SGP4.
- Record element epoch and age.
- Apply observer position and calculate pass locally.
- Mark stale prediction when element age exceeds type-specific threshold.

## 4. Twilight

Calculate:

- sunset/sunrise;
- civil twilight: Sun center -6°;
- nautical: -12°;
- astronomical: -18°.

Account for no-event polar cases.

Darkness selection depends on target:

- Moon/bright planets: civil/nautical can be acceptable;
- stars: target-specific;
- deep-sky: prefer astronomical darkness;
- satellites: passes near twilight may be favorable.

## 5. Moon

Calculate:

- phase/illumination;
- altitude;
- rise/set;
- angular separation from target;
- brightness impact heuristic.

Moon impact is a planning heuristic, not a physical sky-brightness measurement unless a documented model is implemented.

## 6. Horizon and altitude

Default geometric/standard apparent policy must be documented.

- Minimum general altitude default: 20°.
- Recommended quality band often above 30°.
- Near-horizon results receive atmospheric/extinction warning.
- Optional horizon mask is azimuth→minimum-altitude samples.
- Interpolate mask safely across 0/360°.

Airmass may use a documented model and valid altitude range. Do not report airmass near/below the horizon as meaningful.

## 7. Visibility window extraction

1. Sample target altitude over requested interval.
2. Compute dark-enough mask.
3. Compute above-horizon/minimum-altitude mask.
4. Compute optional Moon constraint.
5. Compute optional weather constraint separately.
6. Find contiguous valid windows.
7. Refine boundary times by root finding/interpolation.
8. Calculate maximum altitude and transit within each window.
9. Return top windows and reasons for rejected intervals.

Sampling interval:

- adaptive by target speed and requested range;
- fixed objects can use coarser interval;
- satellites require fine propagation;
- boundary refinement tolerance documented.

## 8. Equipment suitability

### Naked eye

Inputs:

- apparent magnitude;
- angular extent/surface brightness where relevant;
- Bortle class;
- target type;
- altitude.

Do not claim visibility from magnitude alone for diffuse objects.

### Binocular/telescope

Inputs:

- aperture;
- focal length;
- eyepiece focal length;
- apparent field of view;
- target angular size;
- brightness/surface brightness;
- mount limitations where captured.

Derived:

- magnification = telescope focal length / eyepiece focal length;
- approximate true field = apparent field / magnification, with disclaimer;
- exit pupil = aperture / magnification;
- Dawes/Rayleigh resolution only as theoretical references;
- light-gathering comparison.

Suitability is an educational estimate.

## 9. Visibility score

The score is a transparent recommendation heuristic from 0 to 100. It is not a scientific probability.

The score version is required in every result.

Candidate normalized components:

- peak altitude;
- duration above preferred altitude;
- darkness suitability;
- Moon separation/illumination;
- target brightness/surface brightness;
- equipment fit;
- seasonal/culmination quality;
- optional weather quality;
- horizon mask;
- data quality/freshness.

Example baseline weights, subject to validation:

```text
altitude              0.25
duration              0.15
darkness              0.15
moon                  0.10
brightness            0.15
equipment_fit         0.10
weather_optional      0.10
```

If weather is absent, redistribute or expose separate scores:

- `astronomical_score`
- `weather_score nullable`
- `combined_score nullable`

Preferred approach: always show astronomical score and optional combined score.

Score breakdown returns each component, input, normalized result, weight, and explanation.

## 10. Target-type policies

### Planet

- brightness and altitude dominate;
- Moon penalty low;
- twilight acceptable for bright planets;
- apparent angular diameter can influence telescope recommendation.

### Moon

- phase and feature-specific timing;
- brightness is not a difficulty issue;
- full Moon may be poor for terminator detail;
- no Moon-separation penalty.

### Star

- magnitude and altitude;
- color/double-star target may require equipment;
- light pollution effect.

### Galaxy/nebula

- astronomical darkness;
- surface brightness;
- Moon penalty;
- angular size/equipment;
- Bortle class.

### Cluster

Open and globular clusters use separate policies.

### Satellite

- pass elevation;
- illumination/eclipsed state;
- Sun altitude;
- element age;
- pass duration;
- brightness only if supported.

## 11. Planner algorithm

Initial deterministic planner:

1. Generate candidate windows for each target.
2. Filter hard constraints.
3. Divide session into time slots.
4. Score target-slot compatibility.
5. Add transition cost based on angular separation/equipment changes.
6. Select schedule using weighted interval scheduling or bounded optimization.
7. Enforce minimum observation duration.
8. Return reasons and unscheduled targets.

Planner must be deterministic for same inputs and algorithm version.

Do not over-engineer to exact telescope slew mechanics in baseline.

## 12. Rise/transit/set

- Return rise/set only when events occur in interval.
- Handle circumpolar/never-rises.
- Transit may occur below horizon for never-visible targets; label appropriately.
- State altitude threshold/refraction policy.
- For moving objects, use numerical event finding.

## 13. Output contract

For each target:

- entity ID/name/type;
- coordinate source;
- calculation interval;
- best window;
- all qualifying windows;
- rise/transit/set;
- max altitude and azimuth;
- direction at selected time;
- astronomical score;
- optional weather score;
- equipment recommendation;
- warnings;
- data freshness;
- algorithm versions.

## 14. Validation cases

Required reference scenarios:

- Polaris from northern mid-latitude;
- circumpolar star;
- object never rising;
- equatorial target;
- polar day/no astronomical night;
- DST transition;
- Moon close/far from target;
- bright planet in twilight;
- deep-sky target under full Moon;
- ISS-like satellite pass with known reference;
- date outside ephemeris range;
- longitude wrap;
- horizon-mask wrap.

Compare a sample with independent planetarium/ephemeris references and document tolerances.

## 15. Numerical tolerances

Define in tests per operation, for example:

- coordinate transform: angular tolerance;
- event time: seconds/minutes depending model;
- satellite pass: wider tolerance based on element age;
- score: exact deterministic result for fixture.

Never use one global epsilon.

## 16. Weather separation

Weather adapter can provide:

- cloud cover;
- visibility;
- precipitation;
- wind;
- humidity;
- temperature.

Lumina must show weather timestamp and forecast source. Astronomical calculations remain valid independent of provider availability.
