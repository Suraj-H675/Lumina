# Image Identification and Plate Solving

## 1. Purpose

Identify the sky field in a user-provided astronomical image through astrometric plate solving. This is not object-recognition AI and not generative enhancement.

## 2. Supported input

Initial:

- JPEG
- PNG
- FITS where parser support is verified

Limits are environment-configured:

- maximum bytes;
- maximum pixel count;
- minimum dimensions;
- allowed MIME signatures;
- processing timeout.

Do not trust filename extension or browser MIME alone.

## 3. Privacy flow

Before upload:

- explain local/server processing;
- explain whether remote Astrometry.net is used;
- require explicit consent for remote processing;
- default remote visibility to private;
- strip unnecessary EXIF for raster images;
- avoid sending exact location unless required and approved;
- show retention period.

The user can delete a submission. Local deletion and remote deletion limitations are explained.

## 4. Solver modes

### Self-hosted

Preferred for privacy/control when resources permit.

Requirements:

- Astrometry.net solver container/process;
- approved index files;
- index manifest and checksums;
- resource limits;
- queue;
- sandboxed execution;
- no shell interpolation of user filenames.

### Remote Nova

Requires server-side API key.

Flow:

1. login/session;
2. upload with privacy parameters;
3. store external submission ID;
4. poll submission;
5. resolve external job ID;
6. poll job;
7. fetch calibration;
8. fetch annotations/objects;
9. download approved artifacts;
10. normalize result;
11. cleanup.

Use HTTPS endpoints where supported. Do not expose key/session.

## 5. Job state machine

```text
created
→ validating
→ queued
→ submitting
→ waiting_for_solver
→ solving
→ fetching_results
→ succeeded

terminal alternatives:
invalid
unsolved
failed
cancelled
expired
deleted
```

Every transition records time and safe reason.

## 6. Preprocessing

Allowed deterministic operations:

- orientation normalization;
- EXIF stripping;
- format conversion;
- grayscale copy;
- downsampling;
- FITS preview generation;
- star-source extraction only if required.

Preserve original privately until deletion/retention. Never overwrite it.

## 7. Result

Normalized solution:

- center RA/Dec;
- coordinate frame;
- orientation;
- parity;
- pixel scale;
- radius/field size;
- WCS;
- annotations;
- solver/version;
- solution timestamp;
- quality metadata;
- limitations.

## 8. Overlay

Client overlay supports:

- annotation labels;
- constellation lines if derived separately;
- celestial grid;
- entity links;
- show/hide categories;
- zoom/pan;
- original/annotated comparison.

Coordinates must be transformed through WCS, not positioned by arbitrary percentages.

## 9. Capture checks

Deterministic optional checks:

- dimensions;
- metadata;
- background level histogram;
- clipped pixel percentage;
- star elongation/trailing metric;
- focus proxy;
- field rotation only when measurable.

Each check states limitations and cannot claim a universal diagnosis.

## 10. Journal integration

On user action, create local journal entry with:

- date from user-confirmed metadata;
- location only after confirmation;
- solved center;
- detected objects;
- equipment/camera;
- attached local image reference;
- solution ID/export;
- notes.

Do not automatically trust EXIF time/location.

## 11. Failure messages

Distinguish:

- unsupported file;
- too large;
- no stars detected;
- solver timed out;
- no astrometric solution;
- remote provider unavailable;
- result expired;
- internal error.

An unsolved image is not the same as a system error.

## 12. Security

- random object keys;
- private bucket;
- signed short-lived URLs;
- malware/content-type checks;
- decompression bomb defense;
- process CPU/memory/time limit;
- no executable file handling;
- path traversal protection;
- image libraries patched;
- cleanup verified by tests.

## 13. Cost control

Plate solving is resource intensive. Protect with:

- strict upload limits;
- per-client rate limits;
- one active job per anonymous client baseline;
- duplicate hash detection;
- optional self-host instructions;
- queue depth limit;
- clear unavailable state when capacity is reached.

Core Lumina remains usable if identification is disabled.
