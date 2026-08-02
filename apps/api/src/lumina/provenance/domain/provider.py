"""Transport-neutral provider adapter boundary for provenance ingestion."""

from __future__ import annotations

from typing import Protocol

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


class ProviderPayloadInvalid(ProviderContractError):
    """The untrusted object does not match the provider payload contract."""

    code = "provider.payload_invalid"
    safe_message = "The provider payload did not match its declared schema."


class ProviderNormalizationFailed(ProviderContractError):
    """A validated provider payload cannot produce the isolated result."""

    code = "provider.normalization_failed"
    safe_message = "The provider payload could not be normalized."


class ProviderAdapter[RequestT, PayloadT, ResultT](Protocol):
    """Separate fetching, strict payload validation, and normalization."""

    @property
    def source_manifest(self) -> SourceManifest:
        """Return the adapter's sole source identity and capability declaration."""
        ...

    async def fetch(self, request: RequestT) -> object:
        """Return an untrusted, transport-neutral object for a typed request."""
        ...

    def validate_payload(self, payload: object) -> PayloadT:
        """Convert one untrusted object into the strict provider payload DTO."""
        ...

    def normalize(self, request: RequestT, payload: PayloadT) -> ResultT:
        """Convert a validated payload into provider-isolated normalized output."""
        ...
