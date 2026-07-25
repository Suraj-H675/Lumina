# Project and Astronomy Glossary

## Product/engineering

**Canonical entity** — Lumina's stable internal representation of a real object, mission, concept, or related item.

**Source record** — A provider-specific published or retrieved record retained with provenance.

**Measurement** — A value from a source record, including unit, uncertainty, method, and epoch.

**Canonical measurement** — The selected display value referencing one or more measurements and a selection rule.

**Provider adapter** — Code that communicates with one upstream source and normalizes its response.

**Freshness** — The relationship between observation/publication/fetch/expiry timestamps.

**Stale** — Cached data older than its freshness policy but potentially still useful when visibly labelled.

**Local-first** — Personal data is stored on the user's device by default.

**Vertical slice** — A complete user outcome through UI, API, data, tests, and docs.

**Phase gate** — Required acceptance conditions before the next roadmap phase.

## Coordinates/time

**Right ascension (RA)** — Celestial longitude-like coordinate, commonly expressed in hours or degrees.

**Declination (Dec)** — Celestial latitude-like coordinate in degrees.

**ICRS** — International Celestial Reference System used as the baseline frame.

**Epoch** — Reference time for coordinates or orbital elements.

**Proper motion** — Apparent angular motion of a star across the sky over time.

**Parallax** — Apparent positional shift used to estimate distance.

**Alt/Az** — Observer-local altitude and azimuth coordinate system.

**Altitude** — Angle above the horizon.

**Azimuth** — Direction around the horizon, convention documented as degrees from north through east.

**Transit** — Time an object crosses the local meridian and typically reaches maximum altitude.

**Twilight** — Civil, nautical, or astronomical based on Sun altitude.

**Airmass** — Approximate path length through atmosphere relative to zenith; unreliable near horizon.

**Time scale** — UTC, TT, TDB, and related astronomical time systems.

## Observation

**Apparent magnitude** — Logarithmic apparent brightness; smaller/more negative is brighter.

**Absolute magnitude** — Intrinsic brightness normalized to a defined distance.

**Surface brightness** — Brightness distributed over angular area, important for diffuse objects.

**Angular size** — Apparent width on the sky.

**Bortle class** — Qualitative night-sky darkness scale.

**Field of view** — Angular area visible through equipment or captured by a camera.

**Exit pupil** — Diameter of the light beam leaving an eyepiece.

**Seeing** — Atmospheric steadiness affecting image sharpness.

**Transparency** — Atmospheric clarity affecting faint-object visibility.

**Star hopping** — Navigating from recognizable stars to a target.

## Data/catalogs

**TAP** — Table Access Protocol for astronomical database queries.

**ADQL** — Astronomy Data Query Language.

**HEALPix** — Hierarchical spherical pixelization used for sky indexing.

**Gaia** — ESA astrometric mission/catalog.

**SIMBAD** — CDS database for astronomical object identification and bibliography.

**NASA Exoplanet Archive** — NASA/IPAC archive for exoplanets and related data.

**TLE/OMM** — Orbital element formats for Earth-orbiting objects.

**SGP4** — Standard model used to propagate TLE/GP orbital elements.

**Ephemeris** — Predicted/computed positions of astronomical bodies over time.

**JPL DE kernel** — Numerical Solar System ephemeris data set.

## Imaging

**Plate solving** — Determining celestial coordinates, scale, and orientation from star patterns.

**WCS** — World Coordinate System mapping image pixels to sky coordinates.

**Pixel scale** — Angular sky size per pixel.

**Parity** — Orientation handedness of a solved image.

**FITS** — Standard astronomy data/image format.

**False color** — Colors assigned to wavelengths/intensities for visualization.

**Artist's concept** — Illustration, not an observed photograph.

## Physics/simulations

**Two-body problem** — Motion of two masses interacting gravitationally in an idealized isolated system.

**Semi-major axis** — Half the long axis of an elliptical orbit.

**Eccentricity** — Orbit-shape parameter.

**Periapsis/Apoapsis** — Closest/farthest orbital points.

**Delta-v** — Change in velocity capability used in mission planning.

**Specific impulse** — Rocket-engine efficiency measure.

**Transit depth** — Fractional stellar dimming during a planetary transit.

**Radial velocity** — Line-of-sight speed measured through Doppler shift.

**H-R diagram** — Stellar luminosity/absolute magnitude versus temperature/color diagram.

**Event horizon** — Boundary beyond which signals cannot escape to distant observers in the model.

**Photon sphere** — Region of unstable circular photon orbits around a non-rotating black hole.

## Status words

**Measured** — Directly sourced observation/measurement.

**Calculated** — Deterministic result from inputs.

**Estimated** — Inferred approximate value.

**Simulated** — Model output.

**Confirmed** — Accepted status according to specified authority.

**Candidate** — Not confirmed.

**Tentative** — Expected but subject to significant change.

**Unknown** — No reliable value.

**Disputed** — Credible disagreement exists.
