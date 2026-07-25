# Initial Curated Catalog Scope

This defines the Release 1 seed targets. It does **not** provide scientific values. All values must be ingested or curated with sources under the provenance rules.

Entity inclusion is a request to resolve the object through approved sources. Current status/classification must be verified at ingestion time.

## 1. Solar System

### Primary bodies

- Sun
- Mercury
- Venus
- Earth
- Moon
- Mars
- Ceres
- Jupiter
- Saturn
- Uranus
- Neptune
- Pluto
- Eris
- Haumea
- Makemake

### Moons

- Phobos
- Deimos
- Io
- Europa
- Ganymede
- Callisto
- Amalthea
- Mimas
- Enceladus
- Tethys
- Dione
- Rhea
- Titan
- Hyperion
- Iapetus
- Miranda
- Ariel
- Umbriel
- Titania
- Oberon
- Triton
- Nereid
- Charon

### Small-body examples

- 1 Ceres
- 2 Pallas
- 4 Vesta
- 433 Eros
- 101955 Bennu
- 162173 Ryugu
- 99942 Apophis
- 1P/Halley
- 67P/Churyumov–Gerasimenko

Avoid duplicate canonical entities where designation/common name refer to the same body.

## 2. Stars and systems

- Sun
- Sirius
- Canopus
- Alpha Centauri A
- Alpha Centauri B
- Proxima Centauri
- Arcturus
- Vega
- Capella
- Rigel
- Procyon A
- Achernar
- Betelgeuse
- Hadar
- Altair
- Acrux
- Aldebaran
- Antares
- Spica
- Pollux
- Fomalhaut
- Deneb
- Regulus
- Castor
- Polaris
- Bellatrix
- Alnilam
- Alnitak
- Mintaka
- Barnard's Star
- Tau Ceti
- Epsilon Eridani
- TRAPPIST-1
- Kepler-186
- Kepler-452
- 51 Pegasi
- HD 209458
- HD 189733
- K2-18
- LHS 1140
- TOI-700

Create system/member relationships rather than flattening multiple-star systems.

## 3. Deep-sky objects

Baseline target: the full Messier catalog (M1–M110), resolved to canonical entities and alternate NGC/IC/common identifiers.

Featured first-page subset:

- Andromeda Galaxy (M31)
- Triangulum Galaxy (M33)
- Whirlpool Galaxy (M51)
- Sombrero Galaxy (M104)
- Bode's Galaxy (M81)
- Cigar Galaxy (M82)
- Orion Nebula (M42)
- Ring Nebula (M57)
- Dumbbell Nebula (M27)
- Lagoon Nebula (M8)
- Eagle Nebula (M16)
- Trifid Nebula (M20)
- Crab Nebula (M1)
- Pleiades (M45)
- Beehive Cluster (M44)
- Hercules Globular Cluster (M13)
- Omega Nebula (M17)

Additional non-Messier featured entities may be added only with reviewed source manifests:

- Helix Nebula
- Horsehead Nebula
- North America Nebula
- Veil Nebula
- Omega Centauri
- Double Cluster

## 4. Exoplanets and systems

Resolve these through NASA Exoplanet Archive and store current confirmation status:

- Proxima Centauri b
- TRAPPIST-1 b
- TRAPPIST-1 c
- TRAPPIST-1 d
- TRAPPIST-1 e
- TRAPPIST-1 f
- TRAPPIST-1 g
- TRAPPIST-1 h
- 51 Pegasi b
- Kepler-186 f
- Kepler-452 b
- Kepler-22 b
- Kepler-16 b
- Kepler-10 b
- HD 209458 b
- HD 189733 b
- WASP-12 b
- WASP-39 b
- K2-18 b
- TOI-700 d
- TOI-700 e
- LHS 1140 b
- GJ 1214 b
- PSR B1257+12 b
- PSR B1257+12 c
- PSR B1257+12 d

Do not add a habitability label. Show measured/estimated parameters and missing data.

## 5. Missions and spacecraft

Initial linked mission content:

- Apollo 11
- International Space Station
- Voyager 1
- Voyager 2
- Hubble Space Telescope
- James Webb Space Telescope
- Cassini–Huygens
- New Horizons
- Mars Science Laboratory / Curiosity
- Mars 2020 / Perseverance
- Juno
- Parker Solar Probe
- Solar Orbiter
- Rosetta
- Hayabusa2
- OSIRIS-REx
- DART
- Europa Clipper
- Chandrayaan-1
- Chandrayaan-2
- Chandrayaan-3
- Mars Orbiter Mission
- Aditya-L1
- Artemis I

Mission current status must be sourced and timestamped. Historical mission narrative is authored content.

## 6. Concepts

Initial required concepts:

- astronomy
- universe
- observable universe
- galaxy
- star
- planet
- moon
- asteroid
- comet
- nebula
- star cluster
- black hole
- orbit
- gravity
- light-year
- astronomical unit
- parsec
- apparent magnitude
- absolute magnitude
- spectrum
- wavelength
- redshift
- telescope
- aperture
- focal length
- field of view
- constellation
- right ascension
- declination
- altitude
- azimuth
- twilight
- exoplanet
- transit method
- radial velocity method
- habitable zone
- spacecraft
- rocket
- delta-v
- space weather
- aurora
- meteor
- meteorite
- eclipse
- seasons

## 7. Seed-data rules

- A seed manifest lists canonical target and source query identifiers.
- Ingestion scripts retrieve or normalize approved data.
- Manually curated prose is separate from scientific measurement.
- No uncited numeric values in seed JSON.
- No media without manifest.
- Aliases include catalog identifiers.
- Duplicate resolution produces a review report.
- The build can use a smaller test fixture, but production seed scope remains explicit.
