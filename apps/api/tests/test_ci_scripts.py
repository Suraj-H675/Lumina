"""Phase 0C4 repository acceptance and CI-script regression tests."""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from collections.abc import Iterator, Mapping, Sequence
from pathlib import Path
from types import ModuleType

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_PATH = REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml"
SECURITY_SCRIPT = REPOSITORY_ROOT / "scripts" / "ci" / "check_security.sh"
MIGRATION_SCRIPT = REPOSITORY_ROOT / "scripts" / "ci" / "check_migration_integrity.py"
PNPM_WORKSPACE_PATH = REPOSITORY_ROOT / "pnpm-workspace.yaml"
PNPM_LOCKFILE_PATH = REPOSITORY_ROOT / "pnpm-lock.yaml"
PACKAGE_MANIFEST_PATHS = (
    REPOSITORY_ROOT / "package.json",
    REPOSITORY_ROOT / "apps" / "web" / "package.json",
    REPOSITORY_ROOT / "packages" / "api-client" / "package.json",
    REPOSITORY_ROOT / "packages" / "config-typescript" / "package.json",
)
DEPENDENCY_INPUT_PATHS = (*PACKAGE_MANIFEST_PATHS, PNPM_WORKSPACE_PATH, PNPM_LOCKFILE_PATH)


def _load_module(name: str, path: Path) -> ModuleType:
    specification = importlib.util.spec_from_file_location(name, path)
    assert specification is not None
    assert specification.loader is not None
    module = importlib.util.module_from_spec(specification)
    sys.modules[name] = module
    specification.loader.exec_module(module)
    return module


_migration_checker = _load_module("lumina_ci_migration_checker", MIGRATION_SCRIPT)

ACTION_PINS = {
    "actions/checkout": ("3d3c42e5aac5ba805825da76410c181273ba90b1", "v7.0.1"),
    "actions/setup-node": ("820762786026740c76f36085b0efc47a31fe5020", "v7.0.0"),
    "pnpm/action-setup": ("0ebf47130e4866e96fce0953f49152a61190b271", "v6.0.9"),
    "astral-sh/setup-uv": ("c771a70e6277c0a99b617c7a806ffedaca235ff9", "v9.0.0"),
    "actions/upload-artifact": ("043fb46d1a93c77aae656e7c1c64a875d1fc6a0a", "v7.0.1"),
}
TRUFFLEHOG_IMAGE = (
    "ghcr.io/trufflesecurity/trufflehog:3.96.0@"
    "sha256:aa821cf4ace8861c7d096d83818cdf7bb9719028a52d37a52eaad44086a52577"
)
OSV_IMAGE = (
    "ghcr.io/google/osv-scanner:v2.4.0@"
    "sha256:5116601dedc01c1c580eb92371883ec052fc4c13c3fbc109d621a63ac416d475"
)
SECRET_PAYLOAD = "fake-secret-payload-that-must-not-leak"
EXPECTED_PNPM_OVERRIDES = {
    "@hey-api/json-schema-ref-parser@1.4.4>js-yaml": "4.3.1",
    "next@16.2.12>postcss": "8.5.25",
    "next@16.2.12>sharp": "0.35.0",
}
HISTORICAL_TRUFFLEHOG_EXCEPTIONS = (
    (
        "URI",
        "804283dd7b4c7ac295cc23d754f95a1e94fb466f",
        "apps/api/tests/provenance/test_manifests.py",
        68,
    ),
    ("URI", "926d4f273332b8fe476ca5caa76de841dfc547ca", "apps/web/tests/status.test.tsx", 137),
    ("URI", "926d4f273332b8fe476ca5caa76de841dfc547ca", "apps/web/tests/status.test.tsx", 138),
    ("URI", "926d4f273332b8fe476ca5caa76de841dfc547ca", "apps/web/tests/status.test.tsx", 371),
    (
        "URI",
        "926d4f273332b8fe476ca5caa76de841dfc547ca",
        "packages/api-client/tests/transport.test.ts",
        33,
    ),
)


def _run(
    arguments: Sequence[str],
    *,
    cwd: Path,
    env: Mapping[str, str] | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        arguments,
        cwd=cwd,
        env=None if env is None else dict(env),
        check=check,
        capture_output=True,
        text=True,
    )


def _git(repository: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    return _run(["git", *arguments], cwd=repository)


def _initialize_repository(root: Path) -> None:
    root.mkdir(parents=True)
    _git(root, "init", "--initial-branch=main")
    _git(root, "config", "user.name", "Lumina CI Test")
    _git(root, "config", "user.email", "ci-test@example.invalid")


def _commit_all(root: Path, message: str) -> None:
    _git(root, "add", "--all")
    _git(root, "commit", "-m", message)


def _workflow_job(workflow: str, name: str, next_name: str | None) -> str:
    start = workflow.index(f"  {name}:\n")
    end = len(workflow) if next_name is None else workflow.index(f"  {next_name}:\n", start + 1)
    return workflow[start:end]


def _top_level_yaml_block(content: str, name: str) -> tuple[str, ...]:
    lines = content.splitlines()
    starts = [index for index, line in enumerate(lines) if line == f"{name}:"]
    assert len(starts) == 1
    start = starts[0] + 1
    end = next(
        (
            index
            for index in range(start, len(lines))
            if lines[index] and not lines[index].startswith(" ")
        ),
        len(lines),
    )
    return tuple(lines[start:end])


def _yaml_scalar(value: str) -> str:
    if value.startswith('"'):
        decoded = json.loads(value)
        assert isinstance(decoded, str)
        return decoded
    if value.startswith("'"):
        assert value.endswith("'")
        assert "'" not in value[1:-1]
        return value[1:-1]
    assert value and not any(character.isspace() for character in value)
    return value


def _top_level_yaml_mapping(content: str, name: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in _top_level_yaml_block(content, name):
        if not line:
            continue
        assert line.startswith("  ") and not line.startswith("    ")
        key, separator, value = line[2:].partition(": ")
        assert separator
        parsed_key = _yaml_scalar(key)
        assert parsed_key not in values
        values[parsed_key] = _yaml_scalar(value)
    return values


def _assert_exact_pnpm_overrides(overrides: Mapping[str, str]) -> None:
    assert dict(overrides) == EXPECTED_PNPM_OVERRIDES


def _dependency_nodes(records: object) -> Iterator[tuple[str, Mapping[str, object]]]:
    assert isinstance(records, list)

    def walk(node: Mapping[str, object]) -> Iterator[tuple[str, Mapping[str, object]]]:
        for dependency_type in ("dependencies", "devDependencies", "optionalDependencies"):
            dependencies = node.get(dependency_type, {})
            assert isinstance(dependencies, Mapping)
            for name, dependency in dependencies.items():
                assert isinstance(name, str)
                assert isinstance(dependency, Mapping)
                child = dict(dependency)
                yield name, child
                yield from walk(child)

    for record in records:
        assert isinstance(record, Mapping)
        yield from walk(dict(record))


def _direct_dependency_version(node: Mapping[str, object], name: str) -> str:
    dependencies = node.get("dependencies")
    assert isinstance(dependencies, Mapping)
    child = dependencies.get(name)
    assert isinstance(child, Mapping)
    version = child.get("version")
    assert isinstance(version, str)
    return version


def _pnpm_list(*arguments: str) -> object:
    result = _run(["pnpm", "list", *arguments, "--json"], cwd=REPOSITORY_ROOT)
    return json.loads(result.stdout)


def _assert_remediated_dependency_graph(records: object) -> None:
    nodes = tuple(_dependency_nodes(records))
    vulnerable_versions = {
        ("js-yaml", "4.2.0"),
        ("js-yaml", "4.3.0"),
        ("nanoid", "3.3.16"),
        ("postcss", "8.4.31"),
        ("postcss", "8.5.18"),
        ("sharp", "0.34.5"),
    }
    seen_versions = {
        (name, version) for name, node in nodes if isinstance((version := node.get("version")), str)
    }
    assert vulnerable_versions.isdisjoint(seen_versions)

    parser_nodes = [
        node
        for name, node in nodes
        if name == "@hey-api/json-schema-ref-parser"
        and isinstance(node.get("dependencies"), Mapping)
    ]
    assert parser_nodes
    assert all(
        node.get("version") == "1.4.4" and _direct_dependency_version(node, "js-yaml") == "4.3.1"
        for node in parser_nodes
    )

    next_nodes = [
        node
        for name, node in nodes
        if name == "next" and isinstance(node.get("dependencies"), Mapping)
    ]
    assert next_nodes
    assert all(
        node.get("version") == "16.2.12"
        and _direct_dependency_version(node, "postcss") == "8.5.25"
        and _direct_dependency_version(node, "sharp") == "0.35.0"
        for node in next_nodes
    )
    assert ("postcss", "8.5.25") in seen_versions
    assert ("nanoid", "3.3.18") in seen_versions


def _dependency_inputs() -> dict[Path, bytes]:
    return {path: path.read_bytes() for path in DEPENDENCY_INPUT_PATHS}


def _has_pinned_uv_version(output: str) -> bool:
    lines = output.splitlines()
    if len(lines) != 1:
        return False
    fields = lines[0].split()
    return len(fields) >= 2 and fields[0] == "uv" and fields[1] == "0.12.1"


def test_workflow_uses_only_exact_reviewed_action_pins() -> None:
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    action_lines = [line.strip() for line in workflow.splitlines() if "uses:" in line]
    assert action_lines
    for line in action_lines:
        reference, comment = line.removeprefix("- ").removeprefix("uses: ").split(" # ", 1)
        action, commit = reference.rsplit("@", 1)
        assert action in ACTION_PINS
        expected_commit, expected_tag = ACTION_PINS[action]
        assert commit == expected_commit
        assert len(commit) == 40
        assert comment == expected_tag
    assert "actions/cache" not in workflow
    assert "uses: actions/checkout@" in workflow
    assert workflow.count("uses: actions/checkout@") == 4


def test_pnpm_workspace_override_ownership_and_lockfile_metadata_are_exact() -> None:
    workspace = PNPM_WORKSPACE_PATH.read_text(encoding="utf-8")
    lockfile = PNPM_LOCKFILE_PATH.read_text(encoding="utf-8")
    package = json.loads((REPOSITORY_ROOT / "package.json").read_bytes())

    assert _top_level_yaml_block(workspace, "overrides") == (
        '  "@hey-api/json-schema-ref-parser@1.4.4>js-yaml": "4.3.1"',
        '  "next@16.2.12>postcss": "8.5.25"',
        '  "next@16.2.12>sharp": "0.35.0"',
        "",
    )
    _assert_exact_pnpm_overrides(_top_level_yaml_mapping(workspace, "overrides"))
    _assert_exact_pnpm_overrides(_top_level_yaml_mapping(lockfile, "overrides"))
    assert not isinstance(package.get("pnpm"), Mapping) or "overrides" not in package["pnpm"]


@pytest.mark.parametrize(
    "overrides",
    [
        {
            "@hey-api/json-schema-ref-parser@1.4.4>js-yaml": "4.2.0",
            "next@16.2.12>postcss": "8.5.25",
            "next@16.2.12>sharp": "0.35.0",
        },
        {
            **EXPECTED_PNPM_OVERRIDES,
            "next@16.2.12>js-yaml": "4.3.1",
        },
    ],
)
def test_pnpm_override_assertion_rejects_changed_or_additional_selectors(
    overrides: Mapping[str, str],
) -> None:
    with pytest.raises(AssertionError):
        _assert_exact_pnpm_overrides(overrides)


def test_pnpm_lockfile_and_installed_graph_are_frozen_and_remediated() -> None:
    version = _run(["pnpm", "--version"], cwd=REPOSITORY_ROOT)
    assert version.stdout.strip() == "11.17.0"
    _assert_remediated_dependency_graph(_pnpm_list("-r", "--lockfile-only", "--depth", "Infinity"))

    before = _dependency_inputs()
    _run(["pnpm", "install", "--frozen-lockfile"], cwd=REPOSITORY_ROOT)
    assert _dependency_inputs() == before

    _assert_remediated_dependency_graph(_pnpm_list("-r", "--depth", "Infinity"))


def test_installed_next_sharp_is_the_remediated_virtual_store_copy_and_transforms_raw_rgb() -> None:
    records = json.loads(
        _run(
            ["pnpm", "--filter", "@lumina/web", "list", "sharp", "--depth", "Infinity", "--json"],
            cwd=REPOSITORY_ROOT,
        ).stdout
    )
    next_nodes = [node for name, node in _dependency_nodes(records) if name == "next"]
    assert len(next_nodes) == 1
    next_node = next_nodes[0]
    assert next_node.get("version") == "16.2.12"
    dependencies = next_node.get("dependencies")
    assert isinstance(dependencies, Mapping)
    sharp = dependencies.get("sharp")
    assert isinstance(sharp, Mapping)
    assert sharp.get("version") == "0.35.0"
    sharp_path = sharp.get("path")
    assert isinstance(sharp_path, str)
    assert (
        Path(sharp_path) == REPOSITORY_ROOT / "node_modules/.pnpm/sharp@0.35.0/node_modules/sharp"
    )

    transform = _run(
        [
            "node",
            "-e",
            """
const sharp = require(process.argv[1]);
const input = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
(async () => {
  const output = await sharp(input, { raw: { width: 2, height: 2, channels: 3 } })
    .resize(1, 1)
    .png()
    .toBuffer();
  const metadata = await sharp(output).metadata();
  process.stdout.write(JSON.stringify({
    format: metadata.format,
    height: metadata.height,
    length: output.length,
    version: require(`${process.argv[1]}/package.json`).version,
    width: metadata.width,
  }));
})().catch(() => process.exit(1));
""",
            sharp_path,
        ],
        cwd=REPOSITORY_ROOT,
    )
    result = json.loads(transform.stdout)
    assert result["version"] == "0.35.0"
    assert result["format"] == "png"
    assert result["width"] == 1
    assert result["height"] == 1
    assert result["length"] > 0


def test_local_runtime_version_policy_accepts_node_major_24_and_pinned_uv_metadata() -> None:
    _run(
        [
            "node",
            "-e",
            'if (Number(process.versions.node.split(".")[0]) !== 24) process.exit(1)',
        ],
        cwd=REPOSITORY_ROOT,
    )
    assert _has_pinned_uv_version(_run(["uv", "--version"], cwd=REPOSITORY_ROOT).stdout)
    assert _has_pinned_uv_version("uv 0.12.1 (official-build-metadata)\n")
    assert not _has_pinned_uv_version("uv 0.12.2 (official-build-metadata)\n")


def test_workflow_checkout_cache_and_tool_versions_are_fail_closed() -> None:
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    repository = _workflow_job(workflow, "repository", "python_postgres")
    python = _workflow_job(workflow, "python_postgres", "web_e2e")
    web = _workflow_job(workflow, "web_e2e", "security")
    security = _workflow_job(workflow, "security", "phase0_acceptance")

    assert workflow.count("persist-credentials: false") == 4
    assert workflow.count("fetch-depth: 1") == 3
    assert "fetch-depth: 0" in security
    assert "fetch-depth: 1" not in security
    assert "persist-credentials: false" in security
    assert "actions/checkout@" not in _workflow_job(workflow, "phase0_acceptance", None)

    temporary_directory_setup = 'echo "TMPDIR=$RUNNER_TEMP" >> "$GITHUB_ENV"'
    assert "TMPDIR: ${{ runner.temp }}" not in workflow
    assert workflow.count(temporary_directory_setup) == 4
    for checkout_job in (repository, python, web, security):
        assert temporary_directory_setup in checkout_job

    assert workflow.count("cache: false") == 4
    assert workflow.count('cache: "pnpm"') == 3
    assert workflow.count('cache-dependency-path: "pnpm-lock.yaml"') == 3
    for node_job in (repository, python, web, security):
        assert "pnpm/action-setup@" in node_job
        assert "actions/setup-node@" in node_job
        assert "pnpm install --frozen-lockfile" in node_job

    assert workflow.count("astral-sh/setup-uv@") == 2
    assert workflow.count('version: "0.12.1"') == 2
    assert workflow.count('python-version: "3.12.13"') == 2
    assert workflow.count("download-from-astral-mirror: false") == 2
    assert workflow.count("enable-cache: true") == 2
    assert workflow.count('cache-dependency-glob: "uv.lock"') == 2
    assert workflow.count('cache-suffix: "uv-0.12.1"') == 2
    assert workflow.count("cache-python: false") == 2
    for uv_job in (repository, python):
        assert "uv --version |" in uv_job
        assert 'NR == 1 && $1 == "uv" && $2 == "0.12.1"' in uv_job
        assert "uv lock --check" in uv_job
        assert "uv sync --locked" in uv_job


def test_workflow_browser_scanner_and_cleanup_contracts_are_exact() -> None:
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    repository = _workflow_job(workflow, "repository", "python_postgres")
    python = _workflow_job(workflow, "python_postgres", "web_e2e")
    web = _workflow_job(workflow, "web_e2e", "security")
    security = _workflow_job(workflow, "security", "phase0_acceptance")
    clean_tree = (
        "          git diff --exit-code\n"
        "          git diff --cached --quiet\n"
        '          test -z "$(git ls-files --others --exclude-standard)"'
    )

    assert workflow.count(clean_tree) == 4
    assert repository.index("lumina-api-client-first-*") < repository.index(clean_tree)
    candidate_compose = 'docker compose --env-file .env -p "$candidate_project"'
    assert "scripts/bootstrap/create_local_env.py --ephemeral-candidate" in python
    assert "source .env" not in python
    assert python.count("docker compose ") == python.count(candidate_compose) == 5
    assert python.index("down -v --remove-orphans") < python.index("unlink -- .env")
    assert python.index("unlink -- .env") < python.index(clean_tree)
    assert web.index("lumina-status-e2e-*") < web.index(clean_tree)
    assert web.index(clean_tree) < web.index("actions/upload-artifact@")
    assert security.index("lumina-security-*") < security.index(clean_tree)

    browser_command = "pnpm --filter @lumina/web exec playwright install --with-deps chromium"
    assert workflow.count(browser_command) == 1
    assert "playwright install chromium" not in workflow
    assert "playwright install --with-deps\n" not in workflow
    assert 'Version 1.62.1"' in web
    assert "pnpm security:check" in security
    assert "git ls-files -- apps/web/next-env.d.ts" not in repository


def test_security_script_has_exact_images_and_required_static_safeguards() -> None:
    script = SECURITY_SCRIPT.read_text(encoding="utf-8")
    assert SECURITY_SCRIPT.stat().st_mode & 0o111
    assert f"readonly TRUFFLEHOG_IMAGE='{TRUFFLEHOG_IMAGE}'" in script
    assert f"readonly OSV_IMAGE='{OSV_IMAGE}'" in script
    assert "set -euo pipefail" in script
    assert "umask 077" in script
    assert "rev-parse --is-shallow-repository" in script
    assert "rev-parse --verify 'HEAD^{commit}'" in script
    assert "rev-list --count HEAD" in script
    assert "git file:///repo" in script
    assert "--branch=HEAD" in script
    assert "filesystem /candidate" in script
    assert script.count("--network none") == 2
    assert script.count("--no-verification") >= 4
    assert script.count("--no-verification-cache") == 2
    assert script.count("--fail-on-scan-errors") == 2
    assert "--lockfile=/scan/pnpm-lock.yaml" in script
    assert "--lockfile=/scan/uv.lock" in script
    assert "allowedHistoryTuples" in script
    for detector, commit, file_path, line in HISTORICAL_TRUFFLEHOG_EXCEPTIONS:
        assert f'"{detector}|{commit}|{file_path}|{line}"' in script
    assert "JSON.parse" in script
    assert "set -x" not in script


def _write_fake_docker(bin_directory: Path) -> Path:
    fake = bin_directory / "docker"
    fake.write_text(
        """#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sys
import time

args = sys.argv[1:]
scope = "osv"
if "git" in args and "file:///repo" in args:
    scope = "history"
elif "filesystem" in args and "/candidate" in args:
    scope = "filesystem"

mounts = []
for index, value in enumerate(args):
    if value == "--volume" and index + 1 < len(args):
        mounts.append(args[index + 1])

record = {"args": args, "scope": scope}
for mount in mounts:
    if mount.endswith(":/candidate:ro"):
        candidate = Path(mount.removesuffix(":/candidate:ro"))
        record["temp_root"] = str(candidate.parent)
        record["candidate_files"] = sorted(
            path.relative_to(candidate).as_posix()
            for path in candidate.rglob("*")
            if path.is_file() or path.is_symlink()
        )
        record["candidate_content"] = {
            name: (candidate / name).read_text(encoding="utf-8")
            for name in ("candidate.txt", "untracked.txt")
            if (candidate / name).is_file()
        }
    if mount.endswith(":/out:rw"):
        output = Path(mount.removesuffix(":/out:rw"))
        record["temp_root"] = str(output.parent)

with Path(os.environ["FAKE_DOCKER_LOG"]).open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(record, sort_keys=True) + "\\n")

if os.environ.get("FAKE_SLEEP_SCOPE") == scope:
    time.sleep(30)

status = int(os.environ.get(f"FAKE_{scope.upper()}_STATUS", "0"))
secret = os.environ.get("FAKE_SECRET_PAYLOAD", "secret")
if scope in {"history", "filesystem"}:
    if status == 183 or os.environ.get(f"FAKE_{scope.upper()}_OUTPUT_ON_ZERO") == "1":
        if scope == "history":
            source_data = {
                "Git": {
                    "commit": os.environ.get("FAKE_HISTORY_COMMIT", "unexpected-commit"),
                    "file": os.environ.get("FAKE_HISTORY_FILE", "unexpected-file"),
                    "line": int(os.environ.get("FAKE_HISTORY_LINE", "1")),
                }
            }
        else:
            source_data = {"Filesystem": {"file": "candidate.txt", "line": 1}}
        print(
            json.dumps(
                {
                    "DetectorName": os.environ.get(
                        f"FAKE_{scope.upper()}_DETECTOR", "URI"
                    ),
                    "Raw": secret,
                    "SourceMetadata": {"Data": source_data},
                }
            )
        )
    elif status != 0:
        print(f"scanner-error:{secret}", file=sys.stderr)
else:
    for mount in mounts:
        if mount.endswith(":/out:rw"):
            output = Path(mount.removesuffix(":/out:rw")) / "result.json"
            mode = os.environ.get("FAKE_OSV_RESULT", "valid")
            if mode == "missing":
                if not output.is_file():
                    raise RuntimeError("expected a pre-created OSV result")
                output.unlink()
            else:
                result = "{not-json" if mode == "malformed" else json.dumps(
                    {"result": secret if status else []}
                )
                output.write_text(result + "\\n", encoding="utf-8")
            break
    if status not in {0, 1}:
        print(f"osv-error:{secret}", file=sys.stderr)
sys.exit(status)
""",
        encoding="utf-8",
    )
    fake.chmod(0o755)
    return fake


def _security_repository(tmp_path: Path) -> tuple[Path, Path, dict[str, str]]:
    repository = tmp_path / "repository"
    _initialize_repository(repository)
    (repository / ".gitignore").write_text("ignored.txt\nignored.md\n", encoding="utf-8")
    (repository / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'\n", encoding="utf-8")
    (repository / "uv.lock").write_text("version = 1\n", encoding="utf-8")
    (repository / "candidate.txt").write_text("committed-first\n", encoding="utf-8")
    _commit_all(repository, "first")
    (repository / "second.txt").write_text("second revision\n", encoding="utf-8")
    _commit_all(repository, "second")
    (repository / "candidate.txt").write_text("modified-candidate\n", encoding="utf-8")
    (repository / "untracked.txt").write_text("untracked-candidate\n", encoding="utf-8")
    (repository / "ignored.txt").write_text("ignored-secret\n", encoding="utf-8")

    bin_directory = tmp_path / "bin"
    bin_directory.mkdir()
    _write_fake_docker(bin_directory)
    log = tmp_path / "docker.jsonl"
    environment = dict(os.environ)
    environment.update(
        {
            "PATH": f"{bin_directory}{os.pathsep}{environment['PATH']}",
            "FAKE_DOCKER_LOG": str(log),
            "FAKE_SECRET_PAYLOAD": SECRET_PAYLOAD,
            "TMPDIR": str(tmp_path),
        }
    )
    return repository, log, environment


def _scanner_records(log: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()]


def _assert_scanner_temporary_paths_removed(records: Sequence[dict[str, object]]) -> None:
    paths = {
        Path(value) for record in records if isinstance((value := record.get("temp_root")), str)
    }
    assert paths
    assert all(not path.exists() for path in paths)


def _configure_allowed_historical_finding(
    environment: dict[str, str],
    finding: tuple[str, str, str, int] = HISTORICAL_TRUFFLEHOG_EXCEPTIONS[0],
) -> None:
    detector, commit, file_path, line = finding
    environment.update(
        {
            "FAKE_HISTORY_COMMIT": commit,
            "FAKE_HISTORY_DETECTOR": detector,
            "FAKE_HISTORY_FILE": file_path,
            "FAKE_HISTORY_LINE": str(line),
            "FAKE_HISTORY_STATUS": "183",
        }
    )


@pytest.mark.parametrize("finding", HISTORICAL_TRUFFLEHOG_EXCEPTIONS)
def test_security_allows_only_the_exact_historical_uri_tuple(
    tmp_path: Path, finding: tuple[str, str, str, int]
) -> None:
    repository, log, environment = _security_repository(tmp_path)
    _configure_allowed_historical_finding(environment, finding)
    result = _run(["bash", str(SECURITY_SCRIPT)], cwd=repository, env=environment, check=False)
    assert result.returncode == 0
    assert "TruffleHog scope=git-history result=clean lines=1" in result.stdout
    assert SECRET_PAYLOAD not in result.stdout + result.stderr
    _assert_scanner_temporary_paths_removed(_scanner_records(log))


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("FAKE_HISTORY_DETECTOR", "URL"),
        ("FAKE_HISTORY_COMMIT", "0000000000000000000000000000000000000000"),
        ("FAKE_HISTORY_FILE", "apps/api/tests/provenance/test_manifest_validator.py"),
        ("FAKE_HISTORY_LINE", "69"),
    ],
)
def test_security_rejects_historical_tuple_near_misses(
    tmp_path: Path, name: str, value: str
) -> None:
    repository, log, environment = _security_repository(tmp_path)
    _configure_allowed_historical_finding(environment)
    environment[name] = value
    result = _run(["bash", str(SECURITY_SCRIPT)], cwd=repository, env=environment, check=False)
    assert result.returncode == 10
    assert "TruffleHog scope=git-history result=findings exit=183 lines=1" in result.stdout
    assert SECRET_PAYLOAD not in result.stdout + result.stderr
    _assert_scanner_temporary_paths_removed(_scanner_records(log))


def test_security_scans_full_history_and_complete_current_candidate(tmp_path: Path) -> None:
    repository, log, environment = _security_repository(tmp_path)
    result = _run(["bash", str(SECURITY_SCRIPT)], cwd=repository, env=environment, check=False)
    assert result.returncode == 0
    assert result.stderr == ""
    assert SECRET_PAYLOAD not in result.stdout
    assert "TruffleHog scope=git-history result=clean lines=0" in result.stdout
    assert "TruffleHog scope=current-candidate result=clean lines=0" in result.stdout
    assert "OSV scope=canonical-lockfiles result=clean" in result.stdout

    records = _scanner_records(log)
    assert [record["scope"] for record in records] == ["history", "filesystem", "osv"]
    history_args = records[0]["args"]
    filesystem_args = records[1]["args"]
    assert isinstance(history_args, list)
    assert isinstance(filesystem_args, list)
    for required in (
        "git",
        "file:///repo",
        "--branch=HEAD",
        "--no-verification",
        "--no-verification-cache",
        "--no-update",
        "--results=verified,unknown,unverified",
        "--fail",
        "--fail-on-scan-errors",
        "--json",
        "--log-level=-1",
    ):
        assert required in history_args
    for required in (
        "filesystem",
        "/candidate",
        "--no-verification",
        "--no-verification-cache",
        "--no-update",
        "--fail",
        "--fail-on-scan-errors",
    ):
        assert required in filesystem_args
    assert history_args[history_args.index("--network") + 1] == "none"
    assert filesystem_args[filesystem_args.index("--network") + 1] == "none"

    candidate_files = records[1]["candidate_files"]
    candidate_content = records[1]["candidate_content"]
    assert isinstance(candidate_files, list)
    assert isinstance(candidate_content, dict)
    assert "candidate.txt" in candidate_files
    assert "second.txt" in candidate_files
    assert "untracked.txt" in candidate_files
    assert "ignored.txt" not in candidate_files
    assert ".git" not in candidate_files
    assert not any(str(path).startswith(".git/") for path in candidate_files)
    assert candidate_content == {
        "candidate.txt": "modified-candidate\n",
        "untracked.txt": "untracked-candidate\n",
    }

    osv_args = records[2]["args"]
    assert isinstance(osv_args, list)
    mounts = [
        osv_args[index + 1] for index, value in enumerate(osv_args[:-1]) if value == "--volume"
    ]
    assert len(mounts) == 3
    assert any(str(value).endswith("pnpm-lock.yaml:/scan/pnpm-lock.yaml:ro") for value in mounts)
    assert any(str(value).endswith("uv.lock:/scan/uv.lock:ro") for value in mounts)
    assert not any(str(value).endswith(":/repo:ro") for value in mounts)
    _assert_scanner_temporary_paths_removed(records)


@pytest.mark.parametrize(
    ("history_status", "filesystem_status", "expected_status", "expected_result"),
    [
        (183, 0, 10, "scope=git-history result=findings exit=183"),
        (0, 183, 10, "scope=current-candidate result=findings exit=183"),
        (1, 0, 20, "scope=git-history result=execution-error exit=1"),
        (183, 1, 20, "scope=current-candidate result=execution-error exit=1"),
    ],
)
def test_security_result_classes_and_execution_error_precedence(
    tmp_path: Path,
    history_status: int,
    filesystem_status: int,
    expected_status: int,
    expected_result: str,
) -> None:
    repository, log, environment = _security_repository(tmp_path)
    environment["FAKE_HISTORY_STATUS"] = str(history_status)
    environment["FAKE_FILESYSTEM_STATUS"] = str(filesystem_status)
    result = _run(["bash", str(SECURITY_SCRIPT)], cwd=repository, env=environment, check=False)
    assert result.returncode == expected_status
    assert expected_result in result.stdout
    assert SECRET_PAYLOAD not in result.stdout
    assert SECRET_PAYLOAD not in result.stderr
    records = _scanner_records(log)
    assert [record["scope"] for record in records] == ["history", "filesystem", "osv"]
    _assert_scanner_temporary_paths_removed(records)


def test_security_rejects_output_on_false_clean_exit(tmp_path: Path) -> None:
    repository, log, environment = _security_repository(tmp_path)
    environment["FAKE_HISTORY_OUTPUT_ON_ZERO"] = "1"
    result = _run(["bash", str(SECURITY_SCRIPT)], cwd=repository, env=environment, check=False)
    assert result.returncode == 20
    assert "scope=git-history result=execution-error exit=0 lines=1" in result.stdout
    assert SECRET_PAYLOAD not in result.stdout + result.stderr
    _assert_scanner_temporary_paths_removed(_scanner_records(log))


@pytest.mark.parametrize(
    ("osv_status", "expected_status", "expected_result"),
    [
        (1, 10, "OSV scope=canonical-lockfiles result=findings exit=1"),
        (2, 20, "OSV scope=canonical-lockfiles result=execution-error exit=2"),
    ],
)
def test_osv_findings_and_execution_failures_are_distinct_and_private(
    tmp_path: Path,
    osv_status: int,
    expected_status: int,
    expected_result: str,
) -> None:
    repository, log, environment = _security_repository(tmp_path)
    environment["FAKE_OSV_STATUS"] = str(osv_status)
    result = _run(["bash", str(SECURITY_SCRIPT)], cwd=repository, env=environment, check=False)
    assert result.returncode == expected_status
    assert expected_result in result.stdout
    assert SECRET_PAYLOAD not in result.stdout + result.stderr
    _assert_scanner_temporary_paths_removed(_scanner_records(log))


@pytest.mark.parametrize(
    ("result_mode", "line_count"),
    [("missing", 0), ("malformed", 1)],
)
def test_osv_missing_or_malformed_result_is_an_execution_failure(
    tmp_path: Path, result_mode: str, line_count: int
) -> None:
    repository, log, environment = _security_repository(tmp_path)
    environment["FAKE_OSV_RESULT"] = result_mode
    result = _run(["bash", str(SECURITY_SCRIPT)], cwd=repository, env=environment, check=False)
    assert result.returncode == 20
    assert (
        f"OSV scope=canonical-lockfiles result=execution-error exit=0 lines={line_count}"
        in result.stdout
    )
    assert result.stderr == ""
    assert SECRET_PAYLOAD not in result.stdout + result.stderr
    _assert_scanner_temporary_paths_removed(_scanner_records(log))


def test_security_rejects_shallow_history_before_scanning(tmp_path: Path) -> None:
    source, _log, environment = _security_repository(tmp_path / "source")
    shallow = tmp_path / "shallow"
    _run(
        ["git", "clone", "--depth=1", f"file://{source}", str(shallow)],
        cwd=tmp_path,
    )
    shallow_log = tmp_path / "shallow-docker.jsonl"
    environment["FAKE_DOCKER_LOG"] = str(shallow_log)
    environment["TMPDIR"] = str(tmp_path)
    result = _run(["bash", str(SECURITY_SCRIPT)], cwd=shallow, env=environment, check=False)
    assert result.returncode == 20
    assert result.stdout == "Security history-preflight result=execution-error\n"
    assert result.stderr == ""
    assert not shallow_log.exists()
    assert not list(tmp_path.glob("lumina-security-*"))


@pytest.mark.parametrize("sent_signal", [signal.SIGHUP, signal.SIGINT, signal.SIGTERM])
def test_security_signal_cleanup_removes_private_temporary_output(
    tmp_path: Path, sent_signal: signal.Signals
) -> None:
    repository, log, environment = _security_repository(tmp_path)
    environment["FAKE_SLEEP_SCOPE"] = "history"
    process = subprocess.Popen(
        ["bash", str(SECURITY_SCRIPT)],
        cwd=repository,
        env=environment,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline and not log.exists():
        time.sleep(0.01)
    assert log.exists()
    records = _scanner_records(log)
    temporary_root = records[0].get("temp_root")
    if not isinstance(temporary_root, str):
        temporary_directories = list(tmp_path.glob("lumina-security-*"))
        assert len(temporary_directories) == 1
        temporary_root = str(temporary_directories[0])
    os.killpg(process.pid, sent_signal)
    process.communicate(timeout=10)
    assert not Path(temporary_root).exists()


def test_migration_integrity_is_read_only_and_rejects_drift(tmp_path: Path) -> None:
    diagnostics = _migration_checker.validate_migrations()
    assert diagnostics == ()
    assert [
        (contract.filename, contract.revision, contract.down_revision, contract.sha256)
        for contract in _migration_checker.EXPECTED_MIGRATIONS
    ] == [
        (
            "0001_create_job.py",
            "0001_create_job",
            None,
            "d805d2f626f9c9f248c87202a1fd6351f1682c4dd0c930aaca1ec662aad6892b",
        ),
        (
            "0002_grant_job_runtime_dml.py",
            "0002_grant_job_runtime_dml",
            "0001_create_job",
            "8d9de0d1bfc4b4785ad4234028fbba754437c85e4f6adc267193d6044966b889",
        ),
        (
            "d502b5935120_create_catalog_identity_provenance.py",
            "d502b5935120",
            "0002_grant_job_runtime_dml",
            "f95087a60d2365ea52af9c8026b3c7dbf3b780a1f11673f53308e7b6b8400f7b",
        ),
        (
            "e4c9f1a7b362_add_measurement_provenance.py",
            "e4c9f1a7b362",
            "d502b5935120",
            "336a59a593c1f1d5fcfd4b32c3b8405bb290b1f13c9a6fee094e8170249c8c2d",
        ),
        (
            "a1a3c0f17c5e_add_deterministic_catalog_ingestion.py",
            "a1a3c0f17c5e",
            "e4c9f1a7b362",
            "26b5dad738a93d9776a62155c638402319b35365896ab515cb018413274cfda5",
        ),
    ]
    root = tmp_path / "versions"
    shutil.copytree(REPOSITORY_ROOT / "migrations" / "versions", root)
    migration = root / "0001_create_job.py"
    migration.write_bytes(
        migration.read_bytes().replace(
            b'revision = "0001_create_job"', b'revision = "drifted_revision"'
        )
    )
    (root / "0003_unapproved.py").write_text("revision = '0003'\n", encoding="utf-8")
    changed = _migration_checker.validate_migrations(root)
    assert "migration.checksum_mismatch: 0001_create_job.py" in changed
    assert "migration.lineage_mismatch: 0001_create_job.py" in changed
    assert "migration.unapproved_file: 0003_unapproved.py" in changed


def test_root_commands_and_issue_forms_are_publication_complete() -> None:
    package = json.loads((REPOSITORY_ROOT / "package.json").read_bytes())
    scripts = package["scripts"]
    assert "docs:check" not in scripts
    assert scripts["migrations:check"] == "uv run python scripts/ci/check_migration_integrity.py"
    assert scripts["security:check"] == "bash scripts/ci/check_security.sh"
    for command in ("api:check", "manifests:check", "migrations:check"):
        assert f"pnpm run {command}" in scripts["check"]
    assert "docs:check" not in scripts["check"]
    assert "security:check" not in scripts["check"]

    assert not (REPOSITORY_ROOT / "scripts" / "ci" / "check_doc_links.py").exists()
    tracked = _run(["git", "ls-files", "-z"], cwd=REPOSITORY_ROOT).stdout.split("\0")
    assert not any(path.lower().endswith(".md") for path in tracked if path)
    assert ".github/pull_request_template.md" not in tracked

    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    repository = _workflow_job(workflow, "repository", "python_postgres")
    assert "Assert current tree tracks no Markdown" in repository
    assert "awk 'tolower($0) ~ /\\.md$/'" in repository

    template_root = REPOSITORY_ROOT / ".github" / "ISSUE_TEMPLATE"
    assert {path.name for path in template_root.glob("*.yml")} == {
        "bug_report.yml",
        "data_issue.yml",
        "feature_request.yml",
    }
    for template in template_root.glob("*.yml"):
        text = template.read_text(encoding="utf-8")
        assert "required: true" in text
        assert "secret" in text.lower() or "privacy" in text.lower()
    bug_report = (template_root / "bug_report.yml").read_text(encoding="utf-8")
    assert 'GitHub\'s "Report a vulnerability"' in bug_report
    assert "SECURITY.md" not in bug_report


def test_current_fictional_uri_inputs_use_only_inline_trufflehog_ignore_markers() -> None:
    marker = "trufflehog" + ":ignore"
    fixture_credentials = "user" + ":secret"
    transport_credentials = "user" + ":password"
    fixture_marker_line = (
        f'_INVALID_TERMS_URL = "https://{fixture_credentials}@fixtures.invalid/terms"  # {marker}'
    )
    marker_lines = {
        "apps/api/tests/provenance/test_manifests.py": {
            fixture_marker_line,
        },
        "apps/web/tests/status.test.tsx": {
            f'const url = "https://{fixture_credentials}@example.test"; // {marker}',
            f'origin: "https://{fixture_credentials}@example.test", // {marker}',
        },
        "packages/api-client/tests/transport.test.ts": {
            f'"https://{transport_credentials}@api.example.test", // {marker}',
        },
    }
    marker_files = _run(["git", "grep", "-l", marker], cwd=REPOSITORY_ROOT, check=False)
    assert marker_files.returncode == 0
    assert set(marker_files.stdout.splitlines()) == set(marker_lines)
    assert marker not in Path(__file__).read_text(encoding="utf-8")
    for relative_path, expected_lines in marker_lines.items():
        marked_lines = {
            line.strip()
            for line in (REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8").splitlines()
            if marker in line
        }
        assert marked_lines == expected_lines


def test_marker_scope_excludes_a_tracked_checker_source_without_a_literal_marker(
    tmp_path: Path,
) -> None:
    marker = "trufflehog" + ":ignore"
    fixture_credentials = "user" + ":secret"
    repository = tmp_path / "repository"
    _initialize_repository(repository)
    (repository / "fixture.py").write_text(
        f'uri = "https://{fixture_credentials}@example.test"  # {marker}\n', encoding="utf-8"
    )
    (repository / "checker.py").write_text('marker = "trufflehog" + ":ignore"\n', encoding="utf-8")
    _commit_all(repository, "track marker fixture and checker")

    marker_files = _run(["git", "grep", "-l", marker], cwd=repository, check=False)
    assert marker_files.returncode == 0
    assert marker_files.stdout.splitlines() == ["fixture.py"]
