"""Transport-neutral provider adapter boundary for provenance ingestion."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from .manifests import SourceManifest


class ProviderContractError(RuntimeError):
    """Base for fixed provider errors that reveal only code and safe message."""

    code: str
    safe_message: str

    def __init__(self) -> None:
        super().__init__(f"{self.code}: {self.safe_message}")

    def __repr__(self) -> str:
        """Keep request, payload, and internal exception evidence private."""
        return f"{type(self).__name__}(code={self.code!r})"


class ProviderRequestRejected(ProviderContractError):
    """The typed request is not supported by the adapter declaration."""

    code = "provider.request_rejected"
    safe_message = "The provider request was rejected."


class ProviderNotConfigured(ProviderContractError):
    """The process has no approved credential for a provider network request."""

    code = "provider.not_configured"
    safe_message = "The provider is not configured for synchronization."


class ProviderPayloadInvalid(ProviderContractError):
    """The untrusted object does not match the provider payload contract."""

    code = "provider.payload_invalid"
    safe_message = "The provider payload did not match its declared schema."


class ProviderNormalizationFailed(ProviderContractError):
    """A validated provider payload cannot produce the isolated result."""

    code = "provider.normalization_failed"
    safe_message = "The provider payload could not be normalized."


class ProviderFetchError(ProviderContractError):
    """A provider transport failed without retaining transport-specific evidence."""

    http_status: int | None
    retry_after_seconds: int | None

    def __init__(
        self,
        *,
        http_status: int | None = None,
        retry_after_seconds: int | None = None,
    ) -> None:
        if http_status is not None and not 100 <= http_status <= 599:
            raise ValueError("Provider HTTP status is invalid")
        if retry_after_seconds is not None and retry_after_seconds < 0:
            raise ValueError("Provider retry delay is invalid")
        self.http_status = http_status
        self.retry_after_seconds = retry_after_seconds
        super().__init__()
        RuntimeError.__init__(self, self.code)

    def __repr__(self) -> str:
        """Keep request, URL, body, and transport exception evidence private."""
        return f"{type(self).__name__}(code={self.code!r})"


class ProviderFetchTimeout(ProviderFetchError):
    """The provider connection, response, or bounded attempt exceeded its timeout."""

    code = "provider.timeout"
    safe_message = "The provider request timed out."


class ProviderFetchUnavailable(ProviderFetchError):
    """The provider could not be reached or completed a bounded network exchange."""

    code = "provider.transport_unavailable"
    safe_message = "The provider was unavailable."


class ProviderAdapter[RequestT, PayloadT, ResultT](Protocol):
    """Separate fetching, strict payload validation, and normalization."""

    @property
    def source_manifest(self) -> SourceManifest:
        """Return the adapter's sole source identity and capability declaration."""
        ...

    async def fetch(self, request: RequestT, *, attempt_deadline: float | None = None) -> object:
        """Return untrusted data within the framework-owned attempt deadline."""
        ...

    def validate_payload(self, payload: object) -> PayloadT:
        """Convert one untrusted object into the strict provider payload DTO."""
        ...

    def normalize(self, request: RequestT, payload: PayloadT) -> ResultT:
        """Convert a validated payload into provider-isolated normalized output."""
        ...


class ProviderRuntimeAdapter(Protocol):
    """Erased runtime port for one already-constructed provider adapter."""

    @property
    def source_manifest(self) -> SourceManifest:
        """Return the adapter's immutable documentary source identity."""
        ...

    async def fetch(self, request: object, *, attempt_deadline: float | None = None) -> object:
        """Fetch one typed request through the provider's infrastructure boundary."""
        ...

    def validate_payload(self, payload: object) -> object:
        """Validate one untrusted provider response."""
        ...

    def normalize(self, request: object, payload: object) -> object:
        """Normalize one validated response before the registered codec boundary."""
        ...


@runtime_checkable
class ProviderBatchAdapter(ProviderRuntimeAdapter, Protocol):
    """Optional adapter seam for validating and normalizing planned components."""

    def validate_component_payload(self, request: object, payload: object) -> object:
        """Validate one response with its statically declared component context."""
        ...

    def normalize_component(self, request: object, payload: object) -> object:
        """Normalize one validated component before snapshot composition."""
        ...
