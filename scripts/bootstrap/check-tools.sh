#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
export UV_CACHE_DIR="$ROOT_DIR/.cache/uv"
export UV_PYTHON_INSTALL_DIR="$ROOT_DIR/.cache/uv-python"
PINNED_PNPM=$(node -p "require('$ROOT_DIR/package.json').packageManager.split('@').pop()")

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || fail "Git is required."
command -v node >/dev/null 2>&1 || fail "Node.js 24.x active LTS is required."
command -v uv >/dev/null 2>&1 || fail "A maintained uv version >=0.11.0 is required."

NODE_VERSION=$(node -p "process.versions.node")
NODE_MAJOR=${NODE_VERSION%%.*}
[ "$NODE_MAJOR" = "24" ] || fail "Node.js 24.x is required; found $NODE_VERSION."

UV_VERSION=$(uv --version | awk '{print $2}')
UV_MAJOR=$(printf '%s' "$UV_VERSION" | cut -d. -f1)
UV_MINOR=$(printf '%s' "$UV_VERSION" | cut -d. -f2)
if [ "$UV_MAJOR" -eq 0 ] && [ "$UV_MINOR" -lt 11 ]; then
  fail "uv >=0.11.0 is required; found $UV_VERSION."
fi

if command -v corepack >/dev/null 2>&1; then
  PNPM_VERSION=$(corepack pnpm --version)
  PNPM_SOURCE="Corepack"
else
  PNPM_VERSION=$(npm exec --yes --prefer-offline --cache "$ROOT_DIR/.cache/npm" \
    --package="pnpm@$PINNED_PNPM" -- pnpm --version)
  PNPM_SOURCE="repository-local npm cache"
fi
[ "$PNPM_VERSION" = "$PINNED_PNPM" ] ||
  fail "pnpm $PINNED_PNPM is required; activated $PNPM_VERSION."

PYTHON_VERSION=$(uv run --frozen python -c \
  'import platform; print(platform.python_version())')
PYTHON_FAMILY=$(printf '%s' "$PYTHON_VERSION" | cut -d. -f1,2)
[ "$PYTHON_FAMILY" = "3.12" ] ||
  fail "Python 3.12.x is required; found $PYTHON_VERSION."

printf 'Git: %s\n' "$(git --version)"
printf 'Node.js: %s\n' "$NODE_VERSION"
printf 'pnpm: %s (%s)\n' "$PNPM_VERSION" "$PNPM_SOURCE"
printf 'Python: %s\n' "$PYTHON_VERSION"
printf 'uv: %s\n' "$UV_VERSION"
