# Development

## Toolchain

The repository pins its primary runtimes/configuration through:

- `.node-version`;
- `.python-version`;
- `package.json` (`packageManager`);
- `uv.lock` and `pnpm-lock.yaml`;
- CI's pinned setup actions.

## Bootstrap

```sh
./scripts/bootstrap/setup.sh
```

The bootstrap process installs locked dependencies and creates the ignored root `.env` only when it is safe to do so. It must not overwrite an existing environment or silently rotate local PostgreSQL credentials.

## Local database

```sh
docker compose --env-file .env up -d --wait db
uv run alembic upgrade head
```

The development database binds to loopback by default. Runtime and migration roles are intentionally distinct.

## API

```sh
LUMINA_ENV=development uv run lumina-api
```

Default local endpoints:

- API: `http://127.0.0.1:8000`
- liveness: `/health/live`
- readiness: `/health/ready`
- development API docs: `/docs`

## Web

```sh
pnpm dev
```

Default local URL: `http://127.0.0.1:3000`.

The server-only internal API origin and browser-visible public API origin are distinct settings. Development may use loopback for both; public browser configuration must not expose an internal/private origin.

## Worker

```sh
uv run lumina-worker
```

The worker uses the same backend package and PostgreSQL job model. Stop it gracefully with SIGINT/SIGTERM.

## Environment files

- `.env.example` documents safe root/backend development values.
- `apps/web/.env.example` documents web-specific API-origin values.
- `.env` and other local environment files containing real values are ignored.

Never commit generated credentials or copy real secrets into fixtures/documentation.
