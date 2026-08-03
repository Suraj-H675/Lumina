#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly TRUFFLEHOG_IMAGE='ghcr.io/trufflesecurity/trufflehog:3.96.0@sha256:aa821cf4ace8861c7d096d83818cdf7bb9719028a52d37a52eaad44086a52577'
readonly OSV_IMAGE='ghcr.io/google/osv-scanner:v2.4.0@sha256:5116601dedc01c1c580eb92371883ec052fc4c13c3fbc109d621a63ac416d475'

if ! repo_root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  printf 'Security preflight result=execution-error\n'
  exit 20
fi
if [[ "$(git -C "$repo_root" rev-parse --is-shallow-repository 2>/dev/null)" != 'false' ]] ||
  ! git -C "$repo_root" rev-parse --verify 'HEAD^{commit}' >/dev/null 2>&1 ||
  [[ "$(git -C "$repo_root" rev-list --count HEAD 2>/dev/null || printf '0')" -le 0 ]]; then
  printf 'Security history-preflight result=execution-error\n'
  exit 20
fi
if [[ ! -f "$repo_root/pnpm-lock.yaml" || ! -f "$repo_root/uv.lock" ]]; then
  printf 'OSV scope=canonical-lockfiles result=execution-error\n'
  exit 20
fi

security_tmp="$(mktemp -d "${TMPDIR:-/tmp}/lumina-security-XXXXXX")"
chmod 0700 "$security_tmp"

cleanup() {
  if [[ -n "${security_tmp:-}" && -d "$security_tmp" ]]; then
    find "$security_tmp" -depth -delete
  fi
}

signal_exit() {
  local status="$1"
  cleanup
  trap - EXIT HUP INT TERM
  exit "$status"
}

trap cleanup EXIT
trap 'signal_exit 129' HUP
trap 'signal_exit 130' INT
trap 'signal_exit 143' TERM

readonly candidate_directory="$security_tmp/candidate"
readonly osv_output_directory="$security_tmp/osv-output"
mkdir -m 0700 "$candidate_directory" "$osv_output_directory"

readonly candidate_all="$security_tmp/candidate-all"
readonly candidate_list="$security_tmp/candidate-list"
readonly snapshot_stderr="$security_tmp/snapshot.stderr"
readonly history_output="$security_tmp/trufflehog-history.jsonl"
readonly history_stderr="$security_tmp/trufflehog-history.stderr"
readonly filesystem_output="$security_tmp/trufflehog-filesystem.jsonl"
readonly filesystem_stderr="$security_tmp/trufflehog-filesystem.stderr"
readonly history_validation_stderr="$security_tmp/trufflehog-history-validation.stderr"
readonly filesystem_validation_stderr="$security_tmp/trufflehog-filesystem-validation.stderr"
readonly osv_result="$osv_output_directory/result.json"
readonly osv_stdout="$security_tmp/osv.stdout"
readonly osv_stderr="$security_tmp/osv.stderr"
readonly osv_validation_stderr="$security_tmp/osv-validation.stderr"

for output_file in \
  "$candidate_all" \
  "$candidate_list" \
  "$snapshot_stderr" \
  "$history_output" \
  "$history_stderr" \
  "$filesystem_output" \
  "$filesystem_stderr" \
  "$history_validation_stderr" \
  "$filesystem_validation_stderr" \
  "$osv_result" \
  "$osv_stdout" \
  "$osv_stderr" \
  "$osv_validation_stderr"; do
  install -m 0600 /dev/null "$output_file"
done

if ! git -C "$repo_root" ls-files -z --cached --others --exclude-standard >"$candidate_all" 2>"$snapshot_stderr"; then
  printf 'TruffleHog scope=current-candidate result=execution-error\n'
  exit 20
fi
while IFS= read -r -d '' relative_path; do
  if [[ -e "$repo_root/$relative_path" || -L "$repo_root/$relative_path" ]]; then
    printf '%s\0' "$relative_path" >>"$candidate_list"
  fi
done <"$candidate_all"
if [[ ! -s "$candidate_list" ]]; then
  printf 'TruffleHog scope=current-candidate result=execution-error\n'
  exit 20
fi
if ! (
  cd "$repo_root"
  tar \
    --create \
    --file=- \
    --null \
    --verbatim-files-from \
    --no-recursion \
    --files-from="$candidate_list"
) 2>"$snapshot_stderr" | tar \
  --extract \
  --file=- \
  --directory="$candidate_directory" \
  --no-same-owner \
  --no-same-permissions \
  2>>"$snapshot_stderr"; then
  printf 'TruffleHog scope=current-candidate result=execution-error\n'
  exit 20
fi

result_lines() {
  awk 'END { print NR + 0 }' "$1"
}

trufflehog_findings=0
scanner_error=0

set +e
docker run --rm \
  --network none \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,mode=1777,size=256m \
  --volume "${repo_root}:/repo:ro" \
  "$TRUFFLEHOG_IMAGE" \
  git file:///repo \
  --branch=HEAD \
  --no-verification \
  --no-verification-cache \
  --no-update \
  --results=verified,unknown,unverified \
  --fail \
  --fail-on-scan-errors \
  --json \
  --log-level=-1 \
  >"$history_output" 2>"$history_stderr"
history_status=$?

docker run --rm \
  --network none \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,mode=1777,size=256m \
  --volume "${candidate_directory}:/candidate:ro" \
  "$TRUFFLEHOG_IMAGE" \
  filesystem /candidate \
  --no-verification \
  --no-verification-cache \
  --no-update \
  --results=verified,unknown,unverified \
  --fail \
  --fail-on-scan-errors \
  --json \
  --log-level=-1 \
  >"$filesystem_output" 2>"$filesystem_stderr"
filesystem_status=$?

docker run --rm \
  --read-only \
  --volume "${repo_root}/pnpm-lock.yaml:/scan/pnpm-lock.yaml:ro" \
  --volume "${repo_root}/uv.lock:/scan/uv.lock:ro" \
  --volume "${osv_output_directory}:/out:rw" \
  "$OSV_IMAGE" \
  scan source \
  --lockfile=/scan/pnpm-lock.yaml \
  --lockfile=/scan/uv.lock \
  --format=json \
  --output-file=/out/result.json \
  --verbosity=error \
  >"$osv_stdout" 2>"$osv_stderr"
osv_status=$?
set -e

report_trufflehog() {
  local scope="$1"
  local status="$2"
  local output="$3"
  local validation_stderr="$4"
  local lines
  local validation_status
  lines="$(result_lines "$output")"
  if [[ "$status" -eq 0 && ! -s "$output" ]]; then
    printf 'TruffleHog scope=%s result=clean lines=0\n' "$scope"
  elif [[ "$status" -eq 183 && -s "$output" ]]; then
    if node - "$scope" "$output" > /dev/null 2>"$validation_stderr" <<'NODE'
const fs = require("node:fs");

const [scope, output] = process.argv.slice(2);
const allowedHistoryTuples = new Set([
  "URI|804283dd7b4c7ac295cc23d754f95a1e94fb466f|apps/api/tests/provenance/test_manifests.py|68",
  "URI|926d4f273332b8fe476ca5caa76de841dfc547ca|apps/web/tests/status.test.tsx|137",
  "URI|926d4f273332b8fe476ca5caa76de841dfc547ca|apps/web/tests/status.test.tsx|138",
  "URI|926d4f273332b8fe476ca5caa76de841dfc547ca|apps/web/tests/status.test.tsx|371",
  "URI|926d4f273332b8fe476ca5caa76de841dfc547ca|packages/api-client/tests/transport.test.ts|33",
]);

let findings;
try {
  findings = fs
    .readFileSync(output, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
} catch {
  process.exit(20);
}

let hasUnexpectedFinding = false;
for (const finding of findings) {
  if (finding === null || typeof finding !== "object" || typeof finding.DetectorName !== "string") {
    process.exit(20);
  }
  if (scope !== "git-history") {
    hasUnexpectedFinding = true;
    continue;
  }
  const git = finding.SourceMetadata?.Data?.Git;
  if (
    git === null ||
    typeof git !== "object" ||
    typeof git.commit !== "string" ||
    typeof git.file !== "string" ||
    !Number.isInteger(git.line)
  ) {
    process.exit(20);
  }
  const tuple = `${finding.DetectorName}|${git.commit}|${git.file}|${git.line}`;
  if (!allowedHistoryTuples.has(tuple)) {
    hasUnexpectedFinding = true;
  }
}
process.exit(hasUnexpectedFinding ? 10 : 0);
NODE
    then
      printf 'TruffleHog scope=%s result=clean lines=%s\n' "$scope" "$lines"
    else
      validation_status=$?
      if [[ "$validation_status" -eq 10 ]]; then
        printf 'TruffleHog scope=%s result=findings exit=183 lines=%s\n' "$scope" "$lines"
        trufflehog_findings=1
      else
        printf 'TruffleHog scope=%s result=execution-error exit=%s lines=%s\n' \
          "$scope" "$status" "$lines"
        scanner_error=1
      fi
    fi
  else
    printf 'TruffleHog scope=%s result=execution-error exit=%s lines=%s\n' \
      "$scope" "$status" "$lines"
    scanner_error=1
  fi
}

report_trufflehog 'git-history' "$history_status" "$history_output" "$history_validation_stderr"
report_trufflehog \
  'current-candidate' \
  "$filesystem_status" \
  "$filesystem_output" \
  "$filesystem_validation_stderr"

if [[ ! -f "$osv_result" ]]; then
  printf 'OSV scope=canonical-lockfiles result=execution-error exit=%s lines=0\n' "$osv_status"
  scanner_error=1
else
  osv_lines="$(result_lines "$osv_result")"
  if ! node - "$osv_result" > /dev/null 2>"$osv_validation_stderr" <<'NODE'
const fs = require("node:fs");

const [output] = process.argv.slice(2);
try {
  const result = fs.readFileSync(output, "utf8");
  if (result.trim() === "") {
    process.exit(1);
  }
  JSON.parse(result);
} catch {
  process.exit(1);
}
NODE
  then
    printf 'OSV scope=canonical-lockfiles result=execution-error exit=%s lines=%s\n' \
      "$osv_status" "$osv_lines"
    scanner_error=1
  elif [[ "$osv_status" -eq 0 ]]; then
    printf 'OSV scope=canonical-lockfiles result=clean lines=%s\n' "$osv_lines"
  elif [[ "$osv_status" -eq 1 ]]; then
    printf 'OSV scope=canonical-lockfiles result=findings exit=1 lines=%s\n' "$osv_lines"
    dependency_findings=1
  else
    printf 'OSV scope=canonical-lockfiles result=execution-error exit=%s lines=%s\n' \
      "$osv_status" "$osv_lines"
    scanner_error=1
  fi
fi

if [[ "$scanner_error" -ne 0 ]]; then
  exit 20
fi
if [[ "$trufflehog_findings" -ne 0 || "${dependency_findings:-0}" -ne 0 ]]; then
  exit 10
fi
