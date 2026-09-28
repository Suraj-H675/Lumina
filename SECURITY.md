# Security Policy

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose credentials, private uploads, exact user locations, private journal/personal data, remote code execution, authorization boundaries, or destructive data access.

Use GitHub's private vulnerability-reporting / security-advisory flow for this repository when available. If that channel is unavailable, contact the repository owner privately through GitHub rather than posting exploit details publicly.

Include only the minimum information required to reproduce the issue. Do not include real secrets or unrelated private data.

## Security expectations

Nova-Lumina treats these as security-sensitive boundaries:

- provider and database credentials;
- public/private API-origin separation;
- upload and image-identification data;
- exact user location;
- personal browser-stored data and import/export flows;
- external URLs and provider responses;
- database roles, migrations, and job ownership;
- dependency and supply-chain integrity.

Repository CI includes dependency/secret checks, but automated scanning does not replace review.

## Supported version

Until tagged releases exist, only the current `main` branch is actively maintained.
