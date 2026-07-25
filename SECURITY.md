# Security Policy

## Reporting

Do not open a public issue for a vulnerability that exposes secrets, private uploads, exact user locations, remote code execution, authentication bypass, or destructive data access.

Until a dedicated private reporting channel is configured, contact the repository owner privately through the hosting platform account. The repository must add a current security contact before public production deployment.

## Supported versions

Before the first release, only the default branch is supported. After releases begin, this section must list supported versions.

## Scope

Security reports may cover:

- web/API vulnerabilities;
- provider key exposure;
- malicious file processing;
- location/journal privacy;
- object storage;
- imports/exports;
- dependencies;
- deployment configuration.

## Response expectations

The project will:

1. acknowledge;
2. assess severity and affected versions;
3. create a private fix;
4. rotate secrets if necessary;
5. test;
6. release;
7. disclose responsibly when appropriate.

No fixed response-time promise is made before a maintenance team exists.

## Safe research

Do not:

- access real private user data;
- create denial of service;
- exhaust provider quotas;
- upload illegal content;
- publicly disclose before remediation;
- target upstream scientific services.

Use local/test deployments and provided fixtures.
