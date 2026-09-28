#!/usr/bin/env bash
# Re-runnable local PostgreSQL bootstrap with deliberately separated privileges.
set -euo pipefail
export LC_ALL=C

require_secret() {
  local variable_name=$1
  local value=${!variable_name-}
  if (( ${#value} != 64 )) || [[ ! $value =~ ^[0-9A-Fa-f]{64}$ ]]; then
    printf '%s\n' 'Invalid PostgreSQL credential format.' >&2
    exit 1
  fi
}

for secret_name in \
  POSTGRES_PASSWORD \
  POSTGRES_RUNTIME_PASSWORD \
  POSTGRES_MIGRATION_PASSWORD \
  POSTGRES_TEST_RUNTIME_PASSWORD \
  POSTGRES_TEST_MIGRATION_PASSWORD \
  POSTGRES_CATALOG_OPERATOR_PASSWORD \
  POSTGRES_TEST_CATALOG_OPERATOR_PASSWORD
do
  require_secret "$secret_name"
done

run_sql() {
  psql --set=ON_ERROR_STOP=1 --username=lumina_admin --dbname=postgres "$@"
}

run_database_sql() {
  database=$1
  shift
  psql --set=ON_ERROR_STOP=1 --username=lumina_admin --dbname="$database" "$@"
}

role_exists() {
  run_sql -Atqc "SELECT 1 FROM pg_roles WHERE rolname = '$1'" | grep -qx 1
}

configure_role() {
  role=$1
  password=$2
  if ! role_exists "$role"; then
    # Role names are fixed. psql quotes the validated password as an SQL literal.
    printf '%s\n' "CREATE ROLE $role LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD :'role_password';" \
      | psql --set=ON_ERROR_STOP=1 --set=role_password="$password" --username=lumina_admin --dbname=postgres
    return
  fi
  # Existing passwords are never rotated by bootstrap; verification happens below.
  run_sql -c "ALTER ROLE $role NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS"
}

verify_existing_password() {
  role=$1
  password=$2
  database=$3
  if ! PGPASSWORD="$password" psql -h 127.0.0.1 --username="$role" --dbname="$database" \
    -Atqc 'SELECT 1' >/dev/null 2>&1
  then
    printf 'error: existing %s credentials do not match the preserved environment\n' "$role" >&2
    exit 1
  fi
}

app_exists=false
migrate_exists=false
test_app_exists=false
test_migrate_exists=false
catalog_operator_exists=false
test_catalog_operator_exists=false
role_exists lumina_app && app_exists=true
role_exists lumina_migrate && migrate_exists=true
role_exists lumina_test_app && test_app_exists=true
role_exists lumina_test_migrate && test_migrate_exists=true
role_exists lumina_catalog_operator && catalog_operator_exists=true
role_exists lumina_test_catalog_operator && test_catalog_operator_exists=true

configure_role lumina_app "$POSTGRES_RUNTIME_PASSWORD"
configure_role lumina_migrate "$POSTGRES_MIGRATION_PASSWORD"
configure_role lumina_test_app "$POSTGRES_TEST_RUNTIME_PASSWORD"
configure_role lumina_test_migrate "$POSTGRES_TEST_MIGRATION_PASSWORD"
configure_role lumina_catalog_operator "$POSTGRES_CATALOG_OPERATOR_PASSWORD"
configure_role lumina_test_catalog_operator "$POSTGRES_TEST_CATALOG_OPERATOR_PASSWORD"

ensure_database() {
  database=$1
  migration_role=$2
  runtime_role=$3
  operator_role=$4
  if ! run_sql -Atqc "SELECT 1 FROM pg_database WHERE datname = '$database'" | grep -qx 1; then
    run_sql -c "CREATE DATABASE $database OWNER lumina_admin"
  fi

  # The bootstrap administrator, never a migration role, owns each database.
  run_sql -c "ALTER DATABASE $database OWNER TO lumina_admin"
  run_sql -c "REVOKE CONNECT, TEMPORARY ON DATABASE $database FROM PUBLIC"
  run_sql -c "GRANT CONNECT ON DATABASE $database TO lumina_admin, $migration_role, $runtime_role, $operator_role"
  run_sql -c "REVOKE TEMPORARY ON DATABASE $database FROM $operator_role"

  # PostgreSQL 18 maps public-schema ownership to the database owner. Make all grants explicit.
  run_database_sql "$database" -c 'REVOKE ALL ON SCHEMA public FROM PUBLIC'
  run_database_sql "$database" -c "GRANT USAGE, CREATE ON SCHEMA public TO $migration_role"
  run_database_sql "$database" -c "GRANT USAGE ON SCHEMA public TO $runtime_role"
  run_database_sql "$database" -c "GRANT USAGE ON SCHEMA public TO $operator_role"
}

ensure_database lumina lumina_migrate lumina_app lumina_catalog_operator
ensure_database lumina_test lumina_test_migrate lumina_test_app lumina_test_catalog_operator
run_sql -c 'REVOKE CONNECT ON DATABASE postgres FROM PUBLIC'
run_sql -c 'GRANT CONNECT ON DATABASE postgres TO lumina_admin'

if [ "$app_exists" = true ]; then
  verify_existing_password lumina_app "$POSTGRES_RUNTIME_PASSWORD" lumina
fi
if [ "$migrate_exists" = true ]; then
  verify_existing_password lumina_migrate "$POSTGRES_MIGRATION_PASSWORD" lumina
fi
if [ "$test_app_exists" = true ]; then
  verify_existing_password lumina_test_app "$POSTGRES_TEST_RUNTIME_PASSWORD" lumina_test
fi
if [ "$test_migrate_exists" = true ]; then
  verify_existing_password lumina_test_migrate "$POSTGRES_TEST_MIGRATION_PASSWORD" lumina_test
fi
if [ "$catalog_operator_exists" = true ]; then
  verify_existing_password lumina_catalog_operator "$POSTGRES_CATALOG_OPERATOR_PASSWORD" lumina
fi
if [ "$test_catalog_operator_exists" = true ]; then
  verify_existing_password lumina_test_catalog_operator "$POSTGRES_TEST_CATALOG_OPERATOR_PASSWORD" lumina_test
fi
