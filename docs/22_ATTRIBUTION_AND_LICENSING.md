# Attribution and Licensing

This document is operational guidance, not legal advice. Verify source-specific terms before public release.

## 1. Project licensing status

Lumina currently has no project licence. All rights are reserved by default. Third-party data,
media, fonts, libraries, models, and other assets remain governed by their respective licences
and attribution requirements.

Do not imply that third-party material is covered by Lumina's all-rights-reserved status.
Scientific provenance, third-party attribution, dependency-licence review, and asset-manifest
requirements remain mandatory. Licensing must be reconsidered before accepting outside
contributions or declaring Lumina open source.

## 2. Asset manifest

Every non-original asset entry must include:

```yaml
id:
title:
asset_type:
local_path_or_url:
source_page:
creator:
credit_line:
licence:
licence_url:
usage_notes:
modifications:
downloaded_at:
checksum:
entity_ids:
review_status:
```

Build fails for published local assets missing credit/licence.

## 3. Data manifest

Every dataset/kernel includes:

```yaml
provider:
dataset:
release_version:
official_url:
documentation_url:
terms_or_licence:
citation:
retrieved_at:
coverage:
local_file:
checksum:
parser_version:
usage_notes:
```

## 4. NASA

NASA content is often available for educational/informational use, but:

- NASA insignia/logos have special restrictions;
- identifiable people may create publicity/privacy issues;
- third-party content may appear on NASA sites;
- item-specific credits/usage notes must be followed;
- endorsement must not be implied.

Use official usage guidelines and asset metadata.

References:
- https://www.nasa.gov/nasa-brand-center/images-and-media/
- https://images.nasa.gov/
- https://api.nasa.gov/

## 5. ESA and mission media

Check each ESA/archive asset and mission media policy. Preserve required credits and do not assume NASA-style public-domain status.

## 6. Gaia

Use official Gaia acknowledgement/citation guidance for the selected release. Store release version and citation in dataset manifest.

Reference:
- https://gea.esac.esa.int/archive/

## 7. SIMBAD/CDS

Review SIMBAD/CDS terms and database licence/acknowledgement. Use identity and bibliographic data through documented interfaces and preserve source.

Reference:
- https://simbad.cds.unistra.fr/simbad/

## 8. NASA Exoplanet Archive

Cite the archive DOI/data as requested for research/use and preserve publication references where fields derive from papers.

Reference:
- https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html

## 9. JPL

Record ephemeris kernel source and required acknowledgement. Follow SSD API fair-use restrictions.

References:
- https://ssd-api.jpl.nasa.gov/doc/index.php
- https://ssd-api.jpl.nasa.gov/doc/horizons.html

## 10. CelesTrak

Retain CelesTrak source attribution and review its current usage terms before deployment. Do not republish unrestricted bulk archives without review.

Reference:
- https://celestrak.org/

## 11. NOAA

Credit NOAA SWPC for space-weather data and preserve timestamps.

Reference:
- https://www.swpc.noaa.gov/
- https://services.swpc.noaa.gov/

## 12. Astrometry.net

Review code/service licensing and API submission settings. User-upload licences/visibility selections must be respected.

References:
- https://astrometry.net/doc/
- https://astrometry.net/doc/net/api.html

## 13. WorldWide Telescope

WWT engine use must comply with its open-source licence. Individual imagery/layers have separate credits.

Reference:
- https://docs.worldwidetelescope.org/

## 14. OpenStax

Astronomy 2e uses CC BY-NC-SA. Do not copy/adapt into a differently licensed commercial-compatible content set without satisfying attribution, non-commercial, and share-alike requirements.

Lumina's default approach: use as a research reference, write original text, and cite where appropriate.

## 15. Fonts/icons/libraries

- Track font licence if a non-system font is bundled.
- Track icon library licence in dependency notices.
- Do not redistribute font files outside the repository/build as standalone downloads.
- Generated bundles retain dependency notices as required.

## 16. User content

Users retain their images, notes, and journal data. Baseline private processing does not grant Lumina rights to publish them.

Remote plate-solver submission options must reflect user consent.

## 17. Credits UI

- Image/media credit near the asset or immediate credit button.
- Scientific source drawer for data.
- Global `/sources` page for providers/datasets.
- About page for software/data acknowledgements.
- Exported/shared cards retain relevant media/data credit.

## 18. Prohibited

- Unsplash/random image search as a scientific media source without item review.
- Copying Wikipedia text into content files.
- Removing watermarks/credits.
- Using agency logos as Lumina branding.
- Treating a source URL alone as sufficient licence documentation.
- Committing assets with “probably public domain.”
