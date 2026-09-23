"""Contract checks for the tracked Phase 8D quality-audit evidence artifact."""

from __future__ import annotations

import json
from pathlib import Path
from typing import cast

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_ARTIFACT = _REPOSITORY_ROOT / "data/audits/phase-8d-quality-v1.json"
_BROWSER_ZOOM_EVIDENCE = _REPOSITORY_ROOT / "data/audits/phase-8d-browser-zoom-v1.json"
_FIELD_INP_APPROVALS = _REPOSITORY_ROOT / "data/audits/phase-8d-field-inp-approvals-v1.json"
_GPU_MEMORY_EVIDENCE = _REPOSITORY_ROOT / "data/audits/phase-8d-gpu-memory-v1.json"
_MANUAL_PROTOCOL = _REPOSITORY_ROOT / "data/audits/phase-8d-manual-protocol-v1.json"
_REQUIRED_MANUAL_EVIDENCE = {
    "browser-zoom-200",
    "field-inp",
    "representative-hardware-webgl-render-cadence",
    "representative-low-end-device",
    "retained-gpu-memory",
    "screen-reader",
    "wcag-2.2-aa-manual-review",
}


def _load_document() -> dict[str, object]:
    return _load_json_document(_ARTIFACT)


def _load_json_document(path: Path) -> dict[str, object]:
    def reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
        document: dict[str, object] = {}
        for key, value in pairs:
            assert key not in document, f"duplicate JSON key: {key}"
            document[key] = value
        return document

    value = json.loads(
        path.read_text(encoding="utf-8"),
        object_pairs_hook=reject_duplicate_keys,
    )
    assert isinstance(value, dict)
    return value


def _mapping(value: object) -> dict[str, object]:
    assert isinstance(value, dict)
    assert all(isinstance(key, str) for key in value)
    return cast(dict[str, object], value)


def _string(value: object) -> str:
    assert isinstance(value, str)
    return value


def _evidence_paths(document: dict[str, object]) -> list[str]:
    automated = document["automated_evidence"]
    assert isinstance(automated, dict)
    paths: list[str] = []
    for value in automated.values():
        if isinstance(value, str):
            paths.append(value)
        elif isinstance(value, list):
            assert all(isinstance(item, str) for item in value)
            paths.extend(value)
        elif isinstance(value, dict):
            assert all(isinstance(item, str) for item in value.values())
            paths.extend(value.values())
        else:
            raise AssertionError("Phase 8D automated evidence contains an unsupported value")

    manual_tools = document["manual_tools"]
    assert isinstance(manual_tools, dict)
    assert all(isinstance(item, str) for item in manual_tools.values())
    paths.extend(manual_tools.values())
    return paths


def test_phase8d_quality_audit_artifact_is_bounded_and_points_to_real_evidence() -> None:
    document = _load_document()
    assert document["artifact_version"] == 10
    assert document["audit_id"] == "phase-8d-quality-v1"
    assert document["phase"] == "8D"
    assert document["status"] == "manual_evidence_pending"
    documentation_policy = _mapping(document["documentation_policy"])
    assert documentation_policy["format"] == "tracked_json"
    phase_gate = _mapping(document["phase_gate"])
    assert phase_gate["completion"] == "open"
    phase_gate_reason = _string(phase_gate["reason"]).casefold()
    assert "four remaining human/low-end manual artifacts are absent" in phase_gate_reason
    assert "no field-inp artifact exists" in phase_gate_reason
    assert "representative wwt cadence and gpu-memory hardware observations" in phase_gate_reason
    assert "bounded no-follow external evidence input" in phase_gate_reason
    assert (
        "environment-bound screen-reader, zoom, reduced-motion, webgl-disabled" in phase_gate_reason
    )
    assert "protocol-consistent unavailable-environment semantics" in phase_gate_reason
    assert phase_gate["previous_certified_checkpoint"] == {
        "commit": "4ee9a719ea90c0e97814de449c8c450375d8adb6",
        "hosted_ci_run": "35822167938",
        "result": "success",
    }

    thresholds = _mapping(document["performance_threshold_provenance"])
    core_web_vitals_lab = _mapping(thresholds["core_web_vitals_lab"])
    assert core_web_vitals_lab["lcp_ms"] == 2500
    assert core_web_vitals_lab["cls"] == 0.1
    assert core_web_vitals_lab["scripted_interaction_ms"] == 200
    assert _mapping(thresholds["api_in_process"])["budget"] is None
    assert _mapping(thresholds["representative_hardware_wwt"])["budget"] is None

    verification_commands = _mapping(document["verification_commands"])
    assert verification_commands["repository"] == "pnpm check"
    assert verification_commands["python_postgres"] == "LUMINA_ENV=test uv run pytest -q"
    assert verification_commands["web_build"] == "pnpm build"
    assert verification_commands["web_e2e"] == "pnpm test:e2e"
    assert verification_commands["security"] == "pnpm security:check"
    assert verification_commands["field_inp_validator_tests"] == (
        "uv run pytest -q apps/api/tests/test_phase8d_field_inp_evidence.py"
    )
    assert "validate_phase8d_field_inp.py" in _string(
        verification_commands["field_inp_validate_import"]
    )
    assert "--source-export" in _string(verification_commands["field_inp_validate_import"])
    assert "phase-8d-field-inp-v1.json" in _string(
        verification_commands["field_inp_validate_import"]
    )
    assert verification_commands["manual_evidence_validator_tests"] == (
        "uv run pytest -q apps/api/tests/test_phase8d_manual_evidence.py"
    )
    assert "validate_phase8d_manual_evidence.py" in _string(
        verification_commands["manual_evidence_validate"]
    )
    assert verification_commands["manual_evidence_draft_tests"] == (
        "uv run pytest -q apps/api/tests/test_phase8d_manual_draft.py"
    )
    assert "prepare_phase8d_manual_evidence.py" in _string(
        verification_commands["manual_evidence_prepare_draft"]
    )
    assert "<non-audit-draft-path.json>" in _string(
        verification_commands["manual_evidence_prepare_draft"]
    )
    assert "measure-browser-zoom.test.mjs" in _string(
        verification_commands["browser_zoom_tool_tests"]
    )
    assert "audit:browser-zoom" in _string(verification_commands["browser_zoom_real"])
    assert "measure-wwt-hardware.test.mjs" in _string(verification_commands["wwt_tool_tests"])
    assert "measure-wwt-gpu-memory.test.mjs" in _string(verification_commands["wwt_tool_tests"])
    assert "--stub-network" in _string(verification_commands["wwt_plumbing"])
    assert "--headless" not in _string(verification_commands["wwt_representative_hardware"])
    assert "--cycles 5" in _string(verification_commands["wwt_representative_gpu_memory"])
    assert "--settle-ms 5000" in _string(verification_commands["wwt_representative_gpu_memory"])

    repository_root = _REPOSITORY_ROOT.resolve(strict=True)
    for raw_path in _evidence_paths(document):
        path = Path(raw_path)
        assert not path.is_absolute()
        assert ".." not in path.parts
        candidate = _REPOSITORY_ROOT / path
        current = _REPOSITORY_ROOT
        for part in path.parts[:-1]:
            current = current / part
            assert not current.is_symlink(), raw_path
        assert not candidate.is_symlink(), raw_path
        resolved = candidate.resolve(strict=True)
        assert resolved.is_relative_to(repository_root), raw_path
        assert resolved.is_file(), raw_path

    manual = document["manual_evidence_required"]
    assert isinstance(manual, list)
    assert {item["id"] for item in manual} == _REQUIRED_MANUAL_EVIDENCE
    assert all(isinstance(item.get("reason"), str) and item["reason"] for item in manual)
    manual_by_id = {item["id"]: item for item in manual}
    assert {
        item_id for item_id, item in manual_by_id.items() if item.get("status") == "pending"
    } == _REQUIRED_MANUAL_EVIDENCE - {
        "representative-hardware-webgl-render-cadence",
        "retained-gpu-memory",
    }

    manual_evidence_paths = {
        "wcag-2.2-aa-manual-review": "data/audits/phase-8d-wcag-manual-v1.json",
        "screen-reader": "data/audits/phase-8d-screen-reader-v1.json",
        "browser-zoom-200": "data/audits/phase-8d-browser-zoom-manual-v1.json",
        "representative-low-end-device": "data/audits/phase-8d-low-end-device-v1.json",
    }
    for item_id, tracked_path in manual_evidence_paths.items():
        manual_item = _mapping(manual_by_id[item_id])
        readiness = _mapping(manual_item["readiness"])
        assert readiness["draft_generator"] == "scripts/ci/prepare_phase8d_manual_evidence.py"
        assert readiness["draft_generator_tests"] == "apps/api/tests/test_phase8d_manual_draft.py"
        assert readiness["validator"] == "scripts/ci/validate_phase8d_manual_evidence.py"
        assert readiness["validator_tests"] == "apps/api/tests/test_phase8d_manual_evidence.py"
        assert readiness["tracked_evidence_path"] == tracked_path
        assert readiness["manual_evidence_present"] is False
        assert not (_REPOSITORY_ROOT / tracked_path).exists()

    browser_zoom = _mapping(manual_by_id["browser-zoom-200"])
    assert browser_zoom["status"] == "pending"
    browser_zoom_evidence_ref = _mapping(browser_zoom["evidence"])
    assert browser_zoom_evidence_ref["artifact"] == "data/audits/phase-8d-browser-zoom-v1.json"
    assert browser_zoom_evidence_ref["instrumentation"] == (
        "chromium-settings-private-default-zoom-v1"
    )
    assert browser_zoom_evidence_ref["assessment"] == (
        "supporting_real_browser_zoom_automation_manual_review_pending"
    )
    assert browser_zoom_evidence_ref["manual_review_still_required"] is True

    browser_zoom_evidence = _load_json_document(_BROWSER_ZOOM_EVIDENCE)
    assert browser_zoom_evidence["artifact_version"] == 1
    assert browser_zoom_evidence["evidence_id"] == "phase-8d-real-browser-zoom-v1"
    assert browser_zoom_evidence["phase"] == "8D"
    assert browser_zoom_evidence["build_commit"] == ("1bbf4bbb520dac8318f92a6f43039636bac73b00")
    assert (
        browser_zoom_evidence["measurement_command"] == verification_commands["browser_zoom_real"]
    )
    assert browser_zoom_evidence["instrumentation"] == ("chromium-settings-private-default-zoom-v1")

    zoom_assessment = _mapping(browser_zoom_evidence["assessment"])
    assert zoom_assessment["manual_review_still_required"] is True
    assert zoom_assessment["real_browser_zoom_confirmed"] is True
    assert zoom_assessment["status"] == (
        "supporting_real_browser_zoom_automation_manual_review_pending"
    )

    browser_zoom_metrics = _mapping(browser_zoom_evidence["browser_zoom"])
    assert browser_zoom_metrics["native_settings_api"] == "chrome.settingsPrivate.setDefaultZoom"
    assert browser_zoom_metrics["settings_before"] == 1
    assert browser_zoom_metrics["settings_after"] == 2
    assert browser_zoom_metrics["target_factor"] == 2
    zoom_proof = _mapping(browser_zoom_metrics["zoom_proof"])
    assert zoom_proof["realBrowserZoomConfirmed"] is True
    assert zoom_proof["dprRatio"] == 2
    assert zoom_proof["innerWidthRatio"] == 0.5
    assert zoom_proof["outerWidthRatio"] == 1
    baseline_zoom_metrics = _mapping(browser_zoom_metrics["baseline"])
    zoomed_metrics = _mapping(browser_zoom_metrics["zoomed"])
    assert baseline_zoom_metrics["dpr"] == 1
    assert zoomed_metrics["dpr"] == 2
    assert baseline_zoom_metrics["innerWidth"] == 1280
    assert zoomed_metrics["innerWidth"] == 640
    assert zoomed_metrics["visualScale"] == 1

    route_observations = browser_zoom_evidence["route_observations"]
    assert isinstance(route_observations, list)
    assert len(route_observations) == 8
    observed_journeys: set[str] = set()
    for raw_observation in route_observations:
        observation = _mapping(raw_observation)
        journey = _string(observation["journey"])
        observed_journeys.add(journey)
        route_path = _string(observation["path"])
        assert observation["verifiedActualUrl"] == f"http://127.0.0.1:3000{route_path}"
        assert observation["dpr"] == 2
        assert observation["visualScale"] == 1
        assert observation["documentHorizontalOverflow"] is False
        assert observation["h1Visible"] is True
        assert _string(observation["h1Text"])
        focusable_count = observation["focusableCount"]
        assert isinstance(focusable_count, int) and focusable_count > 0
    assert observed_journeys == {
        "deep-sky-canvas-fallback",
        "explore-navigation",
        "hr-diagram-chart-table",
        "identify-async-file-flow",
        "observe-journal-local-data",
        "offline-storage",
    }

    route_summary = _mapping(browser_zoom_evidence["route_summary"])
    assert route_summary["allHeadingsVisible"] is True
    assert route_summary["noDocumentHorizontalOverflow"] is True
    assert route_summary["sampledRouteCount"] == 8

    browser_zoom_target = _mapping(browser_zoom_evidence["target_identity"])
    assert browser_zoom_target["name"] == "Lumina"
    assert browser_zoom_target["shortName"] == "Lumina"
    assert browser_zoom_target["scope"] == "/"
    assert browser_zoom_target["startUrl"] == "/"

    field_inp = _mapping(manual_by_id["field-inp"])
    assert field_inp["status"] == "pending"
    field_inp_readiness = _mapping(field_inp["readiness"])
    assert field_inp_readiness["approval_manifest"] == (
        "data/audits/phase-8d-field-inp-approvals-v1.json"
    )
    assert field_inp_readiness["validator"] == "scripts/ci/validate_phase8d_field_inp.py"
    assert field_inp_readiness["validator_tests"] == (
        "apps/api/tests/test_phase8d_field_inp_evidence.py"
    )
    assert field_inp_readiness["tracked_evidence_path"] == (
        "data/audits/phase-8d-field-inp-v1.json"
    )
    assert field_inp_readiness["approved_source_count"] == 0
    assert field_inp_readiness["approved_deployment_count"] == 0
    assert field_inp_readiness["approved_privacy_review_count"] == 0
    assert field_inp_readiness["approved_export_count"] == 0
    assert field_inp_readiness["runtime_behavioral_tracking_added"] is False
    assert field_inp_readiness["approved_field_evidence_present"] is False
    assert not (_REPOSITORY_ROOT / _string(field_inp_readiness["tracked_evidence_path"])).exists()

    field_inp_approvals = _load_json_document(_FIELD_INP_APPROVALS)
    assert field_inp_approvals["artifact_version"] == 1
    assert field_inp_approvals["manifest_id"] == "phase-8d-field-inp-approvals-v1"
    assert field_inp_approvals["phase"] == "8D"
    assert field_inp_approvals["approved_sources"] == []
    assert field_inp_approvals["approved_deployments"] == []
    assert field_inp_approvals["approved_privacy_reviews"] == []
    assert field_inp_approvals["approved_exports"] == []
    assert (
        "no field-inp evidence is currently admissible"
        in _string(field_inp_approvals["claim_boundary"]).casefold()
    )

    representative_wwt = _mapping(manual_by_id["representative-hardware-webgl-render-cadence"])
    assert representative_wwt["status"] == "recorded"
    evidence = _mapping(representative_wwt["evidence"])
    assert evidence["measurement_command"] == verification_commands["wwt_representative_hardware"]
    assert evidence["instrumentation"] == "wwt-webgl-draw-bearing-raf-v1"
    assert evidence["source"] == "operator-url"
    assert evidence["stub_network"] is False
    assert evidence["headless"] is False
    assert evidence["min_cadence_hz"] is None

    assessment = _mapping(evidence["assessment"])
    assert assessment["representative_hardware_eligible"] is True
    assert assessment["passed_cadence_floor"] is None
    assert assessment["status"] == "representative_measurement_no_floor"

    renderer = _mapping(evidence["renderer"])
    assert renderer["classification"] == "hardware"
    assert renderer["debug_renderer_available"] is True
    assert "Intel" in _string(renderer["renderer"])

    target_identity = _mapping(evidence["target_identity"])
    assert target_identity["name"] == "Lumina"
    assert target_identity["short_name"] == "Lumina"
    assert target_identity["scope"] == "/"
    assert target_identity["start_url"] == "/"

    measurement = _mapping(evidence["measurement"])
    assert measurement["duration_seconds"] == 30
    assert measurement["warmup_seconds"] == 5
    assert isinstance(measurement["draw_calls"], int) and measurement["draw_calls"] > 0
    assert (
        isinstance(measurement["draw_bearing_frame_count"], int)
        and measurement["draw_bearing_frame_count"] > 2
    )
    assert isinstance(measurement["cadence_hz"], (int, float))
    assert measurement["cadence_hz"] > 0

    retained_gpu = _mapping(manual_by_id["retained-gpu-memory"])
    assert retained_gpu["status"] == "recorded"
    retained_evidence = _mapping(retained_gpu["evidence"])
    assert retained_evidence["artifact"] == "data/audits/phase-8d-gpu-memory-v1.json"
    assert retained_evidence["instrumentation"] == "linux-drm-fdinfo-v2"
    assert (
        retained_evidence["assessment"]
        == "observational_only_nonzero_post_leave_allocations_no_floor"
    )
    assert retained_evidence["generic_pass_threshold"] is None

    gpu_evidence = _load_json_document(_GPU_MEMORY_EVIDENCE)
    assert gpu_evidence["artifact_version"] == 1
    assert gpu_evidence["evidence_id"] == "phase-8d-retained-gpu-memory-v1"
    assert gpu_evidence["phase"] == "8D"
    assert gpu_evidence["build_commit"] == "7d2083cac77e742e006d9f177551d527e1f2cbe6"
    assert (
        gpu_evidence["measurement_command"]
        == verification_commands["wwt_representative_gpu_memory"]
    )
    assert gpu_evidence["instrumentation"] == "linux-drm-fdinfo-v2"
    assert gpu_evidence["cycles"] == 5
    assert gpu_evidence["settle_ms"] == 5000

    gpu_assessment = _mapping(gpu_evidence["assessment"])
    assert gpu_assessment["representative_hardware_eligible"] is True
    assert gpu_assessment["status"] == "representative_memory_measurement_no_floor"
    assert gpu_assessment["conclusion"] == "observational_only"

    gpu_renderer = _mapping(gpu_evidence["renderer"])
    assert gpu_renderer["classification"] == "hardware"
    assert gpu_renderer["debug_renderer_available"] is True
    assert "Intel" in _string(gpu_renderer["renderer"])

    drm = _mapping(gpu_evidence["drm"])
    assert drm["driver"] == "i915"
    assert drm["pdev"] == "0000:00:02.0"
    assert drm["render_node"] == "/dev/dri/renderD128"
    assert drm["render_node_vendor_id"] == "0x8086"
    assert drm["renderer_binding_verified"] is True
    assert drm["units"] == "KiB"

    baseline_clients = gpu_evidence["baseline_clients"]
    assert isinstance(baseline_clients, list)
    assert len(baseline_clients) == 1
    baseline_client = _mapping(baseline_clients[0])
    baseline_client_id = _string(baseline_client["client_id"])
    baseline_counters = _mapping(baseline_client["counters_kib"])
    assert baseline_counters["resident-system0"] == 0

    gpu_measurements = gpu_evidence["measurements"]
    assert isinstance(gpu_measurements, list)
    assert [item["cycle"] for item in gpu_measurements] == [1, 2, 3, 4, 5]
    post_leave_resident: list[int] = []
    for raw_item in gpu_measurements:
        item = _mapping(raw_item)
        active_clients = item["active_clients"]
        post_leave_clients = item["post_leave_clients"]
        assert isinstance(active_clients, list)
        assert isinstance(post_leave_clients, list)

        active_by_id = {
            _string(_mapping(client)["client_id"]): _mapping(_mapping(client)["counters_kib"])
            for client in active_clients
        }
        post_leave_by_id = {
            _string(_mapping(client)["client_id"]): _mapping(_mapping(client)["counters_kib"])
            for client in post_leave_clients
        }
        assert baseline_client_id in active_by_id
        assert baseline_client_id in post_leave_by_id
        resident = post_leave_by_id[baseline_client_id]["resident-system0"]
        assert isinstance(resident, int)
        post_leave_resident.append(resident)
        for client_id, counters in post_leave_by_id.items():
            if client_id == baseline_client_id:
                continue
            assert all(value == 0 for value in counters.values())
    assert len(post_leave_resident) == 5
    assert all(value > 0 for value in post_leave_resident)
    assert len(set(post_leave_resident)) > 1

    derived = _mapping(gpu_evidence["derived_observation"])
    assert "preserved independently" in _string(derived["note"])
    assert "No cross-client physical-memory total" in _string(derived["note"])
    resident_summary = _mapping(derived["post_leave_resident_by_client"])
    baseline_summary = _mapping(resident_summary[baseline_client_id])
    assert baseline_summary["series_kib"] == post_leave_resident
    assert baseline_summary["first_kib"] == post_leave_resident[0]
    assert baseline_summary["final_kib"] == post_leave_resident[-1]
    assert baseline_summary["max_kib"] == max(post_leave_resident)
    assert baseline_summary["final_is_max"] is (post_leave_resident[-1] == max(post_leave_resident))

    boundaries = document["claim_boundaries"]
    assert isinstance(boundaries, list)
    serialized = " ".join(boundaries).casefold()
    assert "not described as real browser zoom evidence" in serialized
    assert "not described as completion of the required manual 200% zoom" in serialized
    assert "not described as screen-reader" in serialized
    assert "manual-evidence validator is not described as a performed human" in serialized
    assert "worksheet or template is not described as manual evidence" in serialized
    assert "accepted only as bounded regular files" in serialized
    assert "final-component symlinks and non-regular files are rejected" in serialized
    assert "explicitly confirm reduced-motion mode and webgl-disabled mode" in serialized
    assert "unavailable manual observation may record" in serialized
    assert "inconclusive and observed statuses still require" in serialized
    assert "cannot summarize itself as inconclusive or unavailable" in serialized
    assert "not described as field inp" in serialized
    assert "validator or empty import path is not described as field inp evidence" in serialized
    assert "does not add behavioral tracking" in serialized
    assert "not described as representative low-end hardware" in serialized
    assert "not described as gpu-complete frame timing" in serialized
    assert "not described as deployed http" in serialized
    assert "not described as whole-engine gpu disposal" in serialized


def test_phase8d_manual_protocol_is_bounded_and_matches_pending_evidence() -> None:
    audit = _load_document()
    protocol = _load_json_document(_MANUAL_PROTOCOL)

    assert protocol["artifact_version"] == 1
    assert protocol["protocol_id"] == "phase-8d-manual-protocol-v1"
    assert protocol["phase"] == "8D"

    manual = audit["manual_evidence_required"]
    assert isinstance(manual, list)
    pending_ids = {
        item["id"] for item in manual if isinstance(item, dict) and item.get("status") == "pending"
    }

    evidence_items = _mapping(protocol["evidence_items"])
    assert set(evidence_items) == _REQUIRED_MANUAL_EVIDENCE - {
        "representative-hardware-webgl-render-cadence"
    }
    assert pending_ids == set(evidence_items) - {"retained-gpu-memory"}

    envelope = protocol["evidence_envelope"]
    assert isinstance(envelope, list)
    assert {
        "evidence_id",
        "status",
        "observed_at",
        "build_commit",
        "operator_or_reviewer",
        "browser_os_device",
        "procedure",
        "route_or_flow",
        "observations",
        "evidence_references",
        "findings",
        "claim_boundary",
    }.issubset(envelope)

    journeys = protocol["manual_journeys"]
    assert isinstance(journeys, list)
    journey_ids = {
        item["id"]
        for item in journeys
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    assert journey_ids == {
        "deep-sky-canvas-fallback",
        "explore-navigation",
        "hr-diagram-chart-table",
        "identify-async-file-flow",
        "observe-journal-local-data",
        "offline-storage",
    }

    for item_id, raw_item in evidence_items.items():
        item = _mapping(raw_item)
        assert item["generic_pass_threshold"] is None, item_id
        assert isinstance(item["claim_boundary"], str) and item["claim_boundary"]
        allowed_statuses = item["allowed_statuses"]
        assert isinstance(allowed_statuses, list)
        assert set(allowed_statuses) == {
            "observed_pass",
            "observed_finding",
            "inconclusive",
            "unavailable",
        }
        item_journeys = item["journeys"]
        assert isinstance(item_journeys, list)
        assert all(journey in journey_ids for journey in item_journeys)
