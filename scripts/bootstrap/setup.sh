#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR"

if [ ! -e .env ]; then
  python3 ./scripts/bootstrap/create_local_env.py
fi

export UV_CACHE_DIR="$ROOT_DIR/.cache/uv"
export UV_PYTHON_INSTALL_DIR="$ROOT_DIR/.cache/uv-python"
PINNED_PNPM=$(node -p "require('./package.json').packageManager.split('@').pop()")

run_pnpm() {
  if command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
  else
    npm exec --yes --prefer-offline --cache "$ROOT_DIR/.cache/npm" \
      --package="pnpm@$PINNED_PNPM" -- pnpm "$@"
  fi
}

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" = "24" ] || {
  printf 'error: Node.js 24.x active LTS is required.\n' >&2
  exit 1
}

if ! uv python find 3.12 >/dev/null 2>&1; then
  uv python install "$(tr -d '[:space:]' < .python-version)"
fi

[ "$(run_pnpm --version)" = "$PINNED_PNPM" ] || {
  printf 'error: pnpm %s could not be activated.\n' "$PINNED_PNPM" >&2
  exit 1
}

run_pnpm install --frozen-lockfile
uv sync --frozen

./scripts/bootstrap/check-tools.sh
