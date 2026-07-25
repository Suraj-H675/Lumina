# Space Lab Simulation Specifications

All simulations are deterministic educational models. Every simulation exposes model version, assumptions, limits, equations, and a textual/data alternative.

## Shared simulation contract

Each lab defines:

- `slug`
- title
- learning objectives
- prerequisite concepts
- input schema with unit/range
- default preset
- calculation module
- output schema
- visualization module
- assumptions
- limitations
- references
- validation fixtures
- share/export schema version

Inputs are validated before computation. Invalid states are not silently clamped unless the UI explicitly shows the clamp.

## 1. Orbit Sandbox

### Scope

Two-body Keplerian motion baseline.

Inputs:

- central mass;
- orbiting-body mass optional;
- initial position;
- initial velocity;
- simulation duration;
- time step.

Outputs:

- trajectory;
- orbital energy;
- angular momentum;
- eccentricity;
- semi-major axis for bound orbit;
- period;
- periapsis/apoapsis;
- classification: bound/parabolic-near/escape/collision.

Models:

- analytic orbital elements for suitable inputs;
- numerical integrator optional for visualization;
- collision at configured central-body radius.

Limitations:

- no n-body baseline;
- no relativity;
- no atmospheric drag;
- no oblateness;
- no perturbations.

Validation:

- circular orbit;
- known elliptical orbit;
- escape velocity;
- energy conservation tolerance.

## 2. Build a Planetary System

Scope:

- star plus multiple planets;
- Keplerian periods;
- habitable-zone visualization using documented model;
- simple stability warnings.

Do not claim long-term stability from a simplistic spacing rule. Label Hill-separation checks as heuristics. Advanced n-body mode may be added later with explicit integrator.

## 3. Transit Method Lab

Inputs:

- stellar radius;
- planet radius;
- orbital period;
- semi-major axis;
- inclination;
- impact parameter or geometry;
- limb-darkening model optional advanced;
- cadence/noise optional deterministic seeded.

Outputs:

- light curve;
- transit depth;
- duration;
- geometric alignment;
- detectability illustration.

Baseline depth approximation: `(Rp/Rs)^2` only for simplified central transit; explain limitations.

Random noise requires explicit seed and must be reproducible.

## 4. Radial Velocity Lab

Inputs:

- stellar/planet mass;
- period;
- eccentricity;
- inclination;
- argument/phase;
- seeded measurement noise optional.

Outputs:

- stellar reflex velocity;
- RV curve;
- semi-amplitude;
- observed minimum-mass concept.

Explain `M sin i`. Validate circular and inclined cases.

## 5. Stellar Laboratory

Inputs:

- initial mass;
- optional metallicity presets.

Outputs are qualitative/approximate educational mappings unless a published stellar model grid is used:

- temperature;
- luminosity;
- color;
- lifetime;
- evolutionary path;
- expected remnant.

Do not create fake precision. Mass–luminosity/lifetime relations must state valid mass range and piecewise assumptions.

## 6. H-R Diagram Explorer

- plot curated/source stars with uncertainty where available;
- axes: luminosity/absolute magnitude versus temperature/color;
- temperature axis orientation follows astronomy convention and is labelled;
- filters for class/stage/cluster;
- selected star detail;
- evolutionary tracks only from licensed/source model data;
- table fallback.

## 7. Telescope Builder

Inputs:

- aperture;
- focal length;
- telescope type;
- eyepiece focal length;
- eyepiece apparent field;
- optional Barlow/reducer;
- target angular size.

Outputs:

- focal ratio;
- magnification;
- approximate true field;
- exit pupil;
- theoretical Dawes/Rayleigh limits;
- light-gathering ratio;
- target fit;
- warnings for impractical magnification/exit pupil.

These are optical estimates, not guaranteed views.

## 8. Rocket and Mission Designer

Educational baseline:

- ideal rocket equation;
- stage masses;
- specific impulse;
- thrust;
- payload;
- gravity body;
- simplified mission delta-v budget presets.

Outputs:

- stage delta-v;
- total ideal delta-v;
- thrust-to-weight at ignition;
- mass fractions;
- payload trade-off;
- comparison with preset educational budgets.

Limitations:

- no detailed aerodynamics;
- no real guidance;
- no structural optimization;
- no hazardous construction instructions;
- no operational launch planning.

## 9. Eclipse Simulator

Inputs:

- date/time;
- observer location;
- system geometry/presets.

Baseline may use ephemerides for real events and a conceptual geometry mode.

Outputs:

- Sun/Moon angular size;
- separation;
- umbra/penumbra visualization;
- local phase/timing when validated;
- why eclipses are not monthly.

Safety warning always visible for solar mode.

## 10. Seasons Simulator

Inputs:

- axial tilt;
- orbital position;
- latitude;
- eccentricity preset.

Outputs:

- solar declination;
- noon Sun altitude;
- day-length approximation;
- illumination angle;
- polar day/night;
- comparison of hemispheres.

Emphasize axial tilt, not Earth–Sun distance, as primary seasonal cause.

## 11. Spectroscopy Lab

Modes:

- blackbody continuum;
- emission lines;
- absorption lines;
- Doppler shift;
- element matching.

Inputs:

- temperature;
- selected elements;
- radial velocity;
- resolution;
- optional seeded noise.

Outputs:

- spectrum;
- peak wavelength;
- shifted lines;
- identification explanation.

Line data must come from a documented source or small curated educational dataset.

## 12. Impact Simulator

Inputs:

- diameter;
- density;
- speed;
- angle;
- target material preset.

Outputs:

- kinetic energy;
- energy comparisons;
- approximate crater/effect ranges only from cited empirical models.

Strictly educational. No targeting or optimization. State large uncertainty.

## 13. Black-Hole Visual Model

Components:

- Schwarzschild radius;
- event horizon;
- photon sphere;
- innermost stable orbit for simplified cases;
- lensing visualization;
- accretion-disk illustration;
- tidal-force comparison.

Do not visualize singularity as observed. Rotating black holes require a separate model, not a misleading slider on Schwarzschild equations.

## 14. Relativity Visualizations

Separate lessons:

- special-relativistic time dilation;
- length contraction;
- simultaneity;
- gravitational redshift;
- light cones.

Inputs must remain in numerically stable ranges. Explain reference frames.

## 15. Scale Explorer / Cosmic Zoom

This is a curated logarithmic scale experience, not a physically navigable complete universe.

Each scale node includes:

- characteristic size;
- unit;
- comparison;
- entity links;
- transition explanation;
- source.

Transitions must not imply objects are colocated.

## 16. Field-of-View Simulator

Inputs:

- equipment profile;
- target angular size;
- orientation;
- optional sensor size/pixel size.

Outputs:

- field rectangle/circle;
- target overlay;
- image scale;
- framing guidance.

Use real survey image only with credit/licence.

## 17. Testing

Every formula has:

- unit tests;
- property tests;
- known cases;
- edge limits;
- deterministic seed tests;
- serialization round trip;
- visual snapshot only as secondary evidence;
- accessibility output test.

A simulation is not complete until its model document is visible in the UI.
