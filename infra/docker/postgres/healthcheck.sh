#!/bin/sh
# Fail closed unless the PostgreSQL process and Lumina bootstrap structure are present.
set -eu

PGPASSWORD="$POSTGRES_PASSWORD" pg_isready -h 127.0.0.1 -U lumina_admin -d postgres \
  >/dev/null 2>&1

result=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U lumina_admin -d postgres \
  -Atq --set=ON_ERROR_STOP=1 -c "
    SELECT
      (SELECT count(*) FROM pg_database WHERE datname IN ('lumina', 'lumina_test')) = 2
      AND
      (SELECT count(*) FROM pg_roles
       WHERE rolname IN ('lumina_app', 'lumina_migrate', 'lumina_test_app', 'lumina_test_migrate')) = 4
  " 2>/dev/null)

[ "$result" = "t" ]
