"""Provider synchronization orchestration with lease-fenced resilience semantics."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from collections.abc import Awaitable, Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from typing import Protocol, cast

from lumina.provenance.domain.provider import (
    ProviderBatchAdapter,
    ProviderFetchError,
    ProviderFetchTimeout,
    ProviderFetchUnavailable,
    ProviderNormalizationFailed,
    ProviderPayloadInvalid,
    ProviderRuntimeAdapter,
)
from lumina.provenance.domain.request_plan import (
    ProviderComponentResult,
    ProviderRequestPlan,
)
from lumina.provenance.domain.runtime import (
    PROVIDER_ATTEMPT_TOTAL_SECONDS,
    PROVIDER_REQUEST_CYCLE_SECONDS,
    CircuitFailureKind,
    NormalizedPayload,
    ProviderClaim,
    ProviderClaimOutcome,
    ProviderFailure,
    ProviderFailureCode,
    ProviderFinalizationOutcome,
    ProviderPayloadCodec,
    ProviderRuntimeConfig,
    ProviderRuntimeStore,
    ProviderStatusSnapshot,
    ProviderSyncOutcome,
    RawProviderResponse,
)

_LOGGER = logging.getLogger("lumina.provider")
_INTEGER_PATTERN = re.compile(r"[0-9]+", re.ASCII)
_DEFAULT_RETRY_AFTER_SECONDS = 3_600
TimeoutAtFactory = Callable[[float], AbstractAsyncContextManager[object]]


class ProviderRuntimeError(RuntimeError):
    """Safe provider framework failure that could not be handled as an upstream outcome."""

    def __init__(self) -> None:
        super().__init__("Provider runtime failed.")

    def __repr__(self) -> str:
        return "ProviderRuntimeError(<redacted>)"


class ProviderNotRegistered(ProviderRuntimeError):
    """The requested provider is outside the static production allowlist."""


class ProviderClock(Protocol):
    """UTC clock used for deterministic freshness and circuit decisions."""

    def now(self) -> datetime:
        """Return a timezone-aware UTC instant."""
        ...


class RegistrationLookup(Protocol):
    """Minimal static registry capability used by the sync service."""

    def resolve(self, provider_code: str) -> object | None:
        """Return an explicit registration or no registration."""
        ...


@dataclass(frozen=True, slots=True)
class ProviderSyncReport:
    """Safe internal result for one handled sync request."""

    provider_code: str
    outcome: ProviderSyncOutcome
    failure_code: str | None
    attempts: int
    retries: int
    cache_state: str | None
    stale_fallback: bool
    normalized_payload: NormalizedPayload | None = None
    raw_sha256: str | None = None


class _Registration(Protocol):
    config: ProviderRuntimeConfig
    adapter: ProviderRuntimeAdapter
    request_factory: Callable[[], object]
    payload_codec: ProviderPayloadCodec
    check_replacement: bool
    snapshot_normalizer: (
        Callable[[ProviderRequestPlan, tuple[ProviderComponentResult, ...]], object] | None
    )

    def is_configured(self) -> bool:
        """Return whether the provider can make a network request in this process."""
        ...

    def request_plan(self) -> ProviderRequestPlan:
        """Return the finite fixed request plan for one provider cycle."""
        ...


@dataclass(slots=True)
class _CycleProgress:
    """Mutable bounded progress retained if the outer deadline cancels a cycle."""

    attempts: int = 0
    retries: int = 0


@dataclass(frozen=True, slots=True)
class _CycleSuccess:
    """Validated result ready for lease-fenced success finalization."""

    normalized_payload: NormalizedPayload
    raw_sha256: str
    raw_response: RawProviderResponse
    http_status: int
    attempts: int
    retries: int


@dataclass(frozen=True, slots=True)
class _CycleFailure:
    """Handled provider failure ready for lease-fenced failure finalization."""

    failure: ProviderFailure
    attempts: int
    retries: int


_CycleResult = _CycleSuccess | _CycleFailure


class SystemProviderClock:
    """Production UTC clock kept behind the application seam."""

    def now(self) -> datetime:
        return datetime.now(UTC)


def _event_loop_time() -> float:
    """Return the event-loop monotonic clock used by absolute timeout contexts."""
    return asyncio.get_running_loop().time()


class ProviderSyncService:
    """Execute one bounded provider cycle without holding a DB transaction over HTTP."""

    def __init__(
        self,
        *,
        registry: RegistrationLookup,
        store: ProviderRuntimeStore,
        clock: ProviderClock | None = None,
        sleeper: Callable[[float], Awaitable[None]] = asyncio.sleep,
        monotonic: Callable[[], float] | None = None,
        timeout_at: TimeoutAtFactory | None = None,
        lease_token_factory: Callable[[], str] | None = None,
    ) -> None:
        self._registry = registry
        self._store = store
        self._clock = clock or SystemProviderClock()
        self._sleeper = sleeper
        self._monotonic = monotonic or _event_loop_time
        self._timeout_at = timeout_at or asyncio.timeout_at
        self._lease_token_factory = lease_token_factory or _new_lease_token

    async def sync(self, provider_code: str) -> ProviderSyncReport:
        """Handle one scheduled sync and persist all expected upstream outcomes."""
        registration = self._registration(provider_code)
        config = registration.config
        if not registration.is_configured():
            status = await self._store.status(
                config,
                now=_utc(self._clock.now()),
                payload_codec=registration.payload_codec,
            )
            if not status.state.enabled:
                return _skip_report(provider_code, ProviderClaim(ProviderClaimOutcome.DISABLED))
            return _not_configured_report(provider_code)
        now = _utc(self._clock.now())
        token = self._lease_token_factory()
        lease_guard_started_at = self._monotonic()
        claim = await self._store.acquire(
            config,
            now=now,
            lease_token=token,
            lease_expires_at=now + timedelta(seconds=config.lease_seconds),
        )
        if claim.outcome is not ProviderClaimOutcome.STARTED:
            return _skip_report(provider_code, claim)
        if claim.lease is None:
            raise ProviderRuntimeError()

        request_cycle_deadline = lease_guard_started_at + PROVIDER_REQUEST_CYCLE_SECONDS
        progress = _CycleProgress()
        try:
            async with self._timeout_at(request_cycle_deadline):
                cycle_result = await self._run_cycle(
                    registration,
                    claim,
                    cycle_deadline=request_cycle_deadline,
                    progress=progress,
                )
        except TimeoutError:
            cycle_result = _CycleFailure(
                failure=ProviderFailure(
                    code=ProviderFailureCode.TIMEOUT,
                    kind=CircuitFailureKind.TRANSIENT,
                ),
                attempts=progress.attempts,
                retries=progress.retries,
            )

        if isinstance(cycle_result, _CycleFailure):
            return await self._failure_report(
                config,
                token,
                cycle_result.failure,
                attempts=cycle_result.attempts,
                retries=cycle_result.retries,
                started_at=lease_guard_started_at,
            )

        if registration.check_replacement:
            current = await self._store.status(
                config,
                now=_utc(self._clock.now()),
                payload_codec=registration.payload_codec,
            )
            current_payload = None if current.cache is None else current.cache.normalized_payload
            if not registration.payload_codec.accepts_replacement(
                current_payload,
                cycle_result.normalized_payload,
            ):
                return await self._failure_report(
                    config,
                    token,
                    ProviderFailure(
                        code=ProviderFailureCode.PAYLOAD_INVALID,
                        kind=CircuitFailureKind.CONTRACT,
                        http_status=cycle_result.http_status,
                        raw_response=cycle_result.raw_response,
                    ),
                    attempts=cycle_result.attempts,
                    retries=cycle_result.retries,
                    started_at=lease_guard_started_at,
                )

        finalization = await self._store.finalize_success(
            config,
            now=_utc(self._clock.now()),
            lease_token=token,
            normalized_payload=cycle_result.normalized_payload,
            payload_codec=registration.payload_codec,
            raw_sha256=cycle_result.raw_sha256,
            attempts=cycle_result.attempts,
            retries=cycle_result.retries,
            duration_ms=_duration_ms(lease_guard_started_at, self._monotonic()),
        )
        if finalization.outcome is ProviderFinalizationOutcome.DISABLED:
            _log_outcome(
                config,
                "provider.disabled",
                cycle_result.attempts,
                cycle_result.http_status,
            )
            return ProviderSyncReport(
                provider_code=provider_code,
                outcome=ProviderSyncOutcome.DISABLED,
                failure_code="provider.disabled",
                attempts=cycle_result.attempts,
                retries=cycle_result.retries,
                cache_state=None,
                stale_fallback=False,
            )
        if finalization.outcome is ProviderFinalizationOutcome.COMMITTED:
            _log_outcome(config, "success", cycle_result.attempts, cycle_result.http_status)
        else:
            _log_outcome(config, "provider.fenced", cycle_result.attempts, cycle_result.http_status)
        return ProviderSyncReport(
            provider_code=provider_code,
            outcome=ProviderSyncOutcome.SUCCESS
            if finalization.outcome is ProviderFinalizationOutcome.COMMITTED
            else ProviderSyncOutcome.UPSTREAM_FAILURE,
            failure_code=None,
            attempts=cycle_result.attempts,
            retries=cycle_result.retries,
            cache_state=finalization.cache_state.value
            if finalization.cache_state is not None
            else None,
            stale_fallback=False,
            normalized_payload=cycle_result.normalized_payload,
            raw_sha256=cycle_result.raw_sha256,
        )

    async def _run_cycle(
        self,
        registration: _Registration,
        claim: ProviderClaim,
        *,
        cycle_deadline: float,
        progress: _CycleProgress,
    ) -> _CycleResult:
        """Run one finite request plan inside one absolute deadline.

        Component responses remain process-local until every required component has
        validated and the registered snapshot normalizer has produced one complete
        normalized result.  This is deliberately the only place where planned
        multi-request providers are composed, so the existing one-request providers
        retain their original behavior as one-component plans.
        """
        config = registration.config
        adapter = registration.adapter
        plan = registration.request_plan()
        half_open_probe = claim.lease is not None and claim.lease.half_open_probe
        max_attempts = 1 if half_open_probe else config.max_transient_attempts
        component_results: list[ProviderComponentResult] = []
        response_bodies: list[bytes] = []
        total_response_bytes = 0
        last_response: RawProviderResponse | None = None

        for component in plan.components:
            component_attempts = 0
            while component_attempts < max_attempts:
                attempt_started_at = self._monotonic()
                if attempt_started_at >= cycle_deadline:
                    return _timeout_failure(progress, component_id=component.component_id)
                component_attempts += 1
                progress.attempts += 1
                attempt_deadline = min(
                    attempt_started_at + PROVIDER_ATTEMPT_TOTAL_SECONDS,
                    cycle_deadline,
                )
                try:
                    raw = await adapter.fetch(
                        component.request,
                        attempt_deadline=attempt_deadline,
                    )
                except ProviderFetchTimeout:
                    failure = ProviderFailure(
                        code=ProviderFailureCode.TIMEOUT,
                        kind=CircuitFailureKind.TRANSIENT,
                        component_id=component.component_id,
                    )
                    if self._monotonic() >= cycle_deadline:
                        return _timeout_failure(progress, component_id=component.component_id)
                    if self._retry_if_allowed(
                        claim,
                        component_attempts,
                        max_attempts,
                        cycle_deadline,
                    ):
                        progress.retries += 1
                        await self._sleeper(config.retry_delays_seconds[component_attempts - 1])
                        continue
                    return _CycleFailure(failure, progress.attempts, progress.retries)
                except ProviderFetchUnavailable:
                    failure = ProviderFailure(
                        code=ProviderFailureCode.TRANSPORT_UNAVAILABLE,
                        kind=CircuitFailureKind.TRANSIENT,
                        component_id=component.component_id,
                    )
                    if self._monotonic() >= cycle_deadline:
                        return _timeout_failure(progress, component_id=component.component_id)
                    if self._retry_if_allowed(
                        claim,
                        component_attempts,
                        max_attempts,
                        cycle_deadline,
                    ):
                        progress.retries += 1
                        await self._sleeper(config.retry_delays_seconds[component_attempts - 1])
                        continue
                    return _CycleFailure(failure, progress.attempts, progress.retries)
                except ProviderFetchError:
                    if self._monotonic() >= cycle_deadline:
                        return _timeout_failure(progress, component_id=component.component_id)
                    return _CycleFailure(
                        ProviderFailure(
                            code=ProviderFailureCode.TRANSPORT_UNAVAILABLE,
                            kind=CircuitFailureKind.TRANSIENT,
                            component_id=component.component_id,
                        ),
                        progress.attempts,
                        progress.retries,
                    )

                if self._monotonic() >= cycle_deadline:
                    return _timeout_failure(progress, component_id=component.component_id)
                if not isinstance(raw, RawProviderResponse):
                    return _CycleFailure(
                        ProviderFailure(
                            code=ProviderFailureCode.PAYLOAD_INVALID,
                            kind=CircuitFailureKind.CONTRACT,
                            component_id=component.component_id,
                        ),
                        progress.attempts,
                        progress.retries,
                    )
                last_response = raw
                if (
                    not raw.raw_complete
                    or raw.observed_bytes > component.max_response_bytes
                    or len(raw.body) > component.max_response_bytes
                    or raw.max_response_bytes != component.max_response_bytes
                ):
                    return _CycleFailure(
                        ProviderFailure(
                            code=ProviderFailureCode.RESPONSE_TOO_LARGE,
                            kind=CircuitFailureKind.CONTRACT,
                            http_status=raw.status_code,
                            raw_response=raw,
                            component_id=component.component_id,
                        ),
                        progress.attempts,
                        progress.retries,
                    )

                response_failure = _response_failure(
                    raw,
                    now=_utc(self._clock.now()),
                    config=config,
                    component_id=component.component_id,
                )
                if response_failure is not None:
                    if response_failure.kind is CircuitFailureKind.TRANSIENT and (
                        self._retry_if_allowed(
                            claim, component_attempts, max_attempts, cycle_deadline
                        )
                    ):
                        progress.retries += 1
                        await self._sleeper(config.retry_delays_seconds[component_attempts - 1])
                        continue
                    return _CycleFailure(response_failure, progress.attempts, progress.retries)

                try:
                    if isinstance(adapter, ProviderBatchAdapter):
                        validated = adapter.validate_component_payload(component.request, raw)
                        normalized = adapter.normalize_component(component.request, validated)
                    elif len(plan.components) == 1 and registration.snapshot_normalizer is None:
                        validated = adapter.validate_payload(raw)
                        normalized = adapter.normalize(component.request, validated)
                    else:
                        raise ProviderNormalizationFailed()
                except ProviderPayloadInvalid:
                    return _CycleFailure(
                        ProviderFailure(
                            code=ProviderFailureCode.PAYLOAD_INVALID,
                            kind=CircuitFailureKind.CONTRACT,
                            http_status=raw.status_code,
                            raw_response=raw,
                            component_id=component.component_id,
                        ),
                        progress.attempts,
                        progress.retries,
                    )
                except (ProviderNormalizationFailed, TypeError, ValueError):
                    return _CycleFailure(
                        ProviderFailure(
                            code=ProviderFailureCode.NORMALIZATION_FAILED,
                            kind=CircuitFailureKind.CONTRACT,
                            http_status=raw.status_code,
                            raw_response=raw,
                            component_id=component.component_id,
                        ),
                        progress.attempts,
                        progress.retries,
                    )

                component_results.append(
                    ProviderComponentResult(
                        component_id=component.component_id,
                        normalized=normalized,
                        raw_sha256=hashlib.sha256(raw.body).hexdigest(),
                    )
                )
                response_bodies.append(raw.body)
                total_response_bytes += len(raw.body)
                if (
                    plan.max_total_response_bytes is not None
                    and total_response_bytes > plan.max_total_response_bytes
                ):
                    return _CycleFailure(
                        ProviderFailure(
                            code=ProviderFailureCode.RESPONSE_TOO_LARGE,
                            kind=CircuitFailureKind.CONTRACT,
                            component_id=component.component_id,
                        ),
                        progress.attempts,
                        progress.retries,
                    )
                break
            else:
                raise ProviderRuntimeError()

        try:
            if registration.snapshot_normalizer is not None:
                normalized = registration.snapshot_normalizer(
                    plan,
                    tuple(component_results),
                )
            elif len(component_results) == 1:
                normalized = component_results[0].normalized
            else:
                raise ProviderNormalizationFailed()
            normalized_payload = registration.payload_codec.encode(normalized)
        except (ProviderNormalizationFailed, TypeError, ValueError):
            return _CycleFailure(
                ProviderFailure(
                    code=ProviderFailureCode.NORMALIZATION_FAILED,
                    kind=CircuitFailureKind.CONTRACT,
                    http_status=None if last_response is None else last_response.status_code,
                ),
                progress.attempts,
                progress.retries,
            )
        if last_response is None:
            raise ProviderRuntimeError()
        return _CycleSuccess(
            normalized_payload=normalized_payload,
            raw_sha256=plan.aggregate_sha256(tuple(response_bodies)),
            raw_response=last_response,
            http_status=last_response.status_code,
            attempts=progress.attempts,
            retries=progress.retries,
        )

    async def status(self, provider_code: str) -> ProviderStatusSnapshot:
        registration = self._registration(provider_code)
        return await self._store.status(
            registration.config,
            now=_utc(self._clock.now()),
            payload_codec=registration.payload_codec,
        )

    async def set_enabled(self, provider_code: str, *, enabled: bool) -> ProviderStatusSnapshot:
        registration = self._registration(provider_code)
        return await self._store.set_enabled(
            registration.config,
            enabled=enabled,
            now=_utc(self._clock.now()),
            payload_codec=registration.payload_codec,
        )

    def _registration(self, provider_code: str) -> _Registration:
        registration = self._registry.resolve(provider_code)
        if registration is None or not hasattr(registration, "config"):
            raise ProviderNotRegistered()
        return cast(_Registration, registration)

    def _retry_if_allowed(
        self,
        claim: ProviderClaim,
        attempts: int,
        max_attempts: int,
        cycle_deadline: float,
    ) -> bool:
        return (
            claim.lease is not None
            and not claim.lease.half_open_probe
            and attempts < max_attempts
            and self._monotonic() < cycle_deadline
        )

    async def _failure_report(
        self,
        config: ProviderRuntimeConfig,
        token: str,
        failure: ProviderFailure,
        *,
        attempts: int,
        retries: int,
        started_at: float,
    ) -> ProviderSyncReport:
        finalization = await self._store.finalize_failure(
            config,
            now=_utc(self._clock.now()),
            lease_token=token,
            failure=failure,
            attempts=attempts,
            retries=retries,
            duration_ms=_duration_ms(started_at, self._monotonic()),
        )
        stale = finalization.stale_fallback
        _log_outcome(config, failure.code.value, attempts, failure.http_status)
        if finalization.outcome is ProviderFinalizationOutcome.DISABLED:
            outcome = ProviderSyncOutcome.DISABLED
            code = "provider.disabled"
        elif stale:
            outcome = ProviderSyncOutcome.STALE_FALLBACK
            code = failure.code.value
        else:
            outcome = ProviderSyncOutcome.UPSTREAM_FAILURE
            code = failure.code.value
        return ProviderSyncReport(
            provider_code=config.provider_code,
            outcome=outcome,
            failure_code=code,
            attempts=attempts,
            retries=retries,
            cache_state=finalization.cache_state.value
            if finalization.cache_state is not None
            else None,
            stale_fallback=stale,
        )


def _new_lease_token() -> str:
    import secrets

    return secrets.token_urlsafe(32)


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() != UTC.utcoffset(value):
        raise ProviderRuntimeError()
    return value.astimezone(UTC)


def _duration_ms(started: float, ended: float) -> int:
    return max(0, round((ended - started) * 1_000))


def _timeout_failure(
    progress: _CycleProgress,
    *,
    component_id: str | None = None,
) -> _CycleFailure:
    """Create the single transient failure for an exhausted request-cycle budget."""
    return _CycleFailure(
        failure=ProviderFailure(
            code=ProviderFailureCode.TIMEOUT,
            kind=CircuitFailureKind.TRANSIENT,
            component_id=component_id,
        ),
        attempts=progress.attempts,
        retries=progress.retries,
    )


def _skip_report(provider_code: str, claim: ProviderClaim) -> ProviderSyncReport:
    mapping = {
        ProviderClaimOutcome.NOT_DUE: ProviderSyncOutcome.NOT_DUE,
        ProviderClaimOutcome.DISABLED: ProviderSyncOutcome.DISABLED,
        ProviderClaimOutcome.CIRCUIT_OPEN: ProviderSyncOutcome.CIRCUIT_OPEN,
        ProviderClaimOutcome.ALREADY_RUNNING: ProviderSyncOutcome.ALREADY_RUNNING,
    }
    outcome = mapping[claim.outcome]
    code = {
        ProviderSyncOutcome.DISABLED: "provider.disabled",
        ProviderSyncOutcome.CIRCUIT_OPEN: "provider.circuit_open",
    }.get(outcome)
    return ProviderSyncReport(
        provider_code=provider_code,
        outcome=outcome,
        failure_code=code,
        attempts=0,
        retries=0,
        cache_state=None,
        stale_fallback=False,
    )


def _not_configured_report(provider_code: str) -> ProviderSyncReport:
    return ProviderSyncReport(
        provider_code=provider_code,
        outcome=ProviderSyncOutcome.NOT_CONFIGURED,
        failure_code=ProviderFailureCode.NOT_CONFIGURED.value,
        attempts=0,
        retries=0,
        cache_state=None,
        stale_fallback=False,
    )


def _response_failure(
    response: RawProviderResponse,
    *,
    now: datetime,
    config: ProviderRuntimeConfig,
    component_id: str | None = None,
) -> ProviderFailure | None:
    status = response.status_code
    retry_after = _retry_after_seconds(response, now=now, config=config)
    if status == 429:
        return ProviderFailure(
            code=ProviderFailureCode.HTTP_RATE_LIMITED,
            kind=CircuitFailureKind.RATE_LIMIT,
            http_status=status,
            retry_after_seconds=retry_after or _DEFAULT_RETRY_AFTER_SECONDS,
            component_id=component_id,
        )
    if status == 408:
        return ProviderFailure(
            code=ProviderFailureCode.TIMEOUT,
            kind=CircuitFailureKind.TRANSIENT,
            http_status=status,
            component_id=component_id,
        )
    if 500 <= status <= 599:
        if retry_after is not None:
            return ProviderFailure(
                code=ProviderFailureCode.HTTP_SERVER_ERROR,
                kind=CircuitFailureKind.RATE_LIMIT,
                http_status=status,
                retry_after_seconds=retry_after,
                component_id=component_id,
            )
        return ProviderFailure(
            code=ProviderFailureCode.HTTP_SERVER_ERROR,
            kind=CircuitFailureKind.TRANSIENT,
            http_status=status,
            component_id=component_id,
        )
    if status != 200:
        return ProviderFailure(
            code=ProviderFailureCode.HTTP_REJECTED,
            kind=CircuitFailureKind.CONTRACT,
            http_status=status,
            component_id=component_id,
        )
    return None


def _retry_after_seconds(
    response: RawProviderResponse,
    *,
    now: datetime,
    config: ProviderRuntimeConfig,
) -> int | None:
    raw = response.headers.get("retry-after")
    if raw is None and response.retry_after_seconds is not None:
        raw_seconds = response.retry_after_seconds
    elif raw is not None and _INTEGER_PATTERN.fullmatch(raw.strip()) is not None:
        raw_seconds = _bounded_decimal_seconds(
            raw.strip(), maximum=config.retry_after_maximum_seconds
        )
    elif raw is not None:
        try:
            date = parsedate_to_datetime(raw)
        except (TypeError, ValueError, OverflowError):
            return None
        if date.tzinfo is None:
            return None
        raw_seconds = round((date.astimezone(UTC) - now).total_seconds())
    else:
        return None
    if raw_seconds < 0:
        return None
    return max(
        config.retry_after_minimum_seconds,
        min(config.retry_after_maximum_seconds, raw_seconds),
    )


def _bounded_decimal_seconds(value: str, *, maximum: int) -> int:
    """Parse a decimal Retry-After value without converting unbounded digits."""
    significant = value.lstrip("0") or "0"
    maximum_text = str(maximum)
    if len(significant) > len(maximum_text) or (
        len(significant) == len(maximum_text) and significant > maximum_text
    ):
        return maximum
    return int(significant, 10)


def _log_outcome(
    config: ProviderRuntimeConfig,
    outcome: str,
    attempts: int,
    http_status: int | None,
) -> None:
    _LOGGER.info(
        "provider_sync_outcome",
        extra={
            "provider_code": config.provider_code,
            "outcome_code": outcome,
            "attempt": attempts,
            "http_status": http_status,
        },
    )


__all__ = [
    "ProviderClock",
    "ProviderNotRegistered",
    "ProviderRuntimeError",
    "ProviderRuntimeStore",
    "ProviderSyncReport",
    "ProviderSyncService",
    "SystemProviderClock",
]
