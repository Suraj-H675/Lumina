"""Transactional canonical selection and fingerprinting for the reviewed Messier slice."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Final
from uuid import UUID, uuid5

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from lumina.catalog.infrastructure.simbad_messier import (
    DECLINATION_QUANTITY,
    EXPECTED_DATASET,
    EXPECTED_PROVIDER,
    EXPECTED_RELEASE,
    RIGHT_ASCENSION_QUANTITY,
)

_SELECTION_RULE: Final = "simbad_messier_j2000"
_SELECTION_VERSION: Final = "v1"
_EXPLANATION: Final = "Selected from the reviewed CDS SIMBAD Messier ICRS J2000 v1 dataset."
V2_SELECTION_RULE: Final = "simbad_messier_j2000_catalogue_anchor"
V2_SELECTION_VERSION: Final = "v2"
MESSIER_V2_SELECTION_SHA256: Final = (
    "060455a10673f873c613ceccc4d7a401472ccb2d845342f2434b6cafd2bc2660"
)
V2_EXPLANATION: Final = (
    "Selected from the reviewed CDS SIMBAD Messier ICRS J2000 v2 catalogue-anchor dataset; "
    "this is the resolver-record reference position, not an asserted geometric target centre."
)
_SELECTION_NAMESPACE: Final = UUID("f30f9e0b-72ee-5c61-9c95-a2a2d2a7e8a1")
_TIMEOUT_SQL = text(
    "SELECT set_config('statement_timeout', '5000ms', true), "
    "set_config('lock_timeout', '5000ms', true)"
)
_ELIGIBLE_SQL = text(
    "SELECT entity.id AS entity_id, entity.canonical_name, entity.slug, "
    "quantity.code AS quantity_code, measurement.id AS measurement_id, "
    "measurement.original_value, measurement.original_unit, measurement.value_numeric, "
    "measurement.source_fact_key, source_record.provider_record_id, "
    "provider.code AS provider_code, dataset.code AS dataset_code, dataset.release_version "
    "FROM public.measurement AS measurement "
    "JOIN public.source_record AS source_record ON source_record.id = measurement.source_record_id "
    "JOIN public.provider AS provider ON provider.id = source_record.provider_id "
    "JOIN public.dataset AS dataset ON dataset.id = source_record.dataset_id "
    "JOIN public.entity AS entity ON entity.id = measurement.entity_id "
    "JOIN public.quantity AS quantity ON quantity.id = measurement.quantity_id "
    "WHERE entity.slug LIKE 'messier-%' AND provider.code = :provider_code "
    "AND dataset.code = :dataset_code AND dataset.release_version = :release_version "
    "AND quantity.code IN (:right_ascension, :declination) "
    "ORDER BY entity.slug, quantity.code"
)
_ACTIVE_SQL = text(
    "SELECT canonical.id, canonical.entity_id, canonical.quantity_id, canonical.measurement_id, "
    "canonical.selection_rule, canonical.selection_version, canonical.explanation, "
    "quantity.code AS quantity_code "
    "FROM public.canonical_measurement AS canonical "
    "JOIN public.quantity AS quantity ON quantity.id = canonical.quantity_id "
    "JOIN public.entity AS entity ON entity.id = canonical.entity_id "
    "WHERE entity.slug LIKE 'messier-%' AND quantity.code IN (:right_ascension, :declination) "
    "AND canonical.superseded_at IS NULL"
)
_SUPERSEDE_SQL = text(
    "UPDATE public.canonical_measurement "
    "SET superseded_at = GREATEST(selected_at, CURRENT_TIMESTAMP) "
    "WHERE id = :id AND superseded_at IS NULL"
)
_INSERT_SELECTION_SQL = text(
    "INSERT INTO public.canonical_measurement "
    "(id, entity_id, quantity_id, measurement_id, selection_rule, selection_version, explanation) "
    "VALUES (:id, :entity_id, "
    "(SELECT id FROM public.quantity WHERE code = :quantity_code), "
    ":measurement_id, :selection_rule, :selection_version, :explanation)"
)


class MessierSelectionError(RuntimeError):
    """The complete reviewed Messier selection set was not safely selectable."""


@dataclass(frozen=True, slots=True)
class MessierSelectionResult:
    fingerprint: str
    inserted_count: int
    unchanged_count: int
    superseded_count: int


@dataclass(frozen=True, slots=True)
class MessierSelectionProfile:
    """One closed reviewed Messier coordinate-selection contract."""

    provider: str
    dataset: str
    release: str
    right_ascension: str
    declination: str
    selection_rule: str
    selection_version: str
    explanation: str
    fingerprint_schema_version: int


V1_SELECTION_PROFILE: Final = MessierSelectionProfile(
    provider=EXPECTED_PROVIDER,
    dataset=EXPECTED_DATASET,
    release=EXPECTED_RELEASE,
    right_ascension=RIGHT_ASCENSION_QUANTITY,
    declination=DECLINATION_QUANTITY,
    selection_rule=_SELECTION_RULE,
    selection_version=_SELECTION_VERSION,
    explanation=_EXPLANATION,
    fingerprint_schema_version=1,
)
V2_SELECTION_PROFILE: Final = MessierSelectionProfile(
    provider=EXPECTED_PROVIDER,
    dataset=EXPECTED_DATASET,
    release="v2",
    right_ascension=RIGHT_ASCENSION_QUANTITY,
    declination=DECLINATION_QUANTITY,
    selection_rule=V2_SELECTION_RULE,
    selection_version=V2_SELECTION_VERSION,
    explanation=V2_EXPLANATION,
    fingerprint_schema_version=2,
)


def _selection_id(entity_id: UUID, quantity_code: str, measurement_id: UUID) -> UUID:
    return uuid5(_SELECTION_NAMESPACE, f"{entity_id}:{quantity_code}:{measurement_id}")


def _fingerprint(rows: list[dict[str, object]], *, schema_version: int = 1) -> str:
    payload = json.dumps(
        {
            "schema_version": schema_version,
            "rows": sorted(
                rows, key=lambda row: tuple(str(row[k]) for k in ("slug", "quantity_code"))
            ),
        },
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


class PostgreSqlMessierCanonicalSelectionStore:
    """Select the reviewed pair for every Messier entity in one transaction."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        profile: MessierSelectionProfile = V1_SELECTION_PROFILE,
    ) -> None:
        self._session_factory = session_factory
        self._profile = profile

    async def select_and_fingerprint(self) -> MessierSelectionResult:
        async with self._session_factory() as session, session.begin():
            await session.execute(_TIMEOUT_SQL)
            result = await session.execute(
                _ELIGIBLE_SQL,
                {
                    "provider_code": self._profile.provider,
                    "dataset_code": self._profile.dataset,
                    "release_version": self._profile.release,
                    "right_ascension": self._profile.right_ascension,
                    "declination": self._profile.declination,
                },
            )
            rows = [dict(row) for row in result.mappings()]
            if len(rows) != 220 or len({row["entity_id"] for row in rows}) != 110:
                raise MessierSelectionError("Incomplete reviewed Messier selection set.")
            by_entity: dict[UUID, dict[str, dict[str, object]]] = {}
            for row in rows:
                entity_id = row["entity_id"]
                quantity_code = row["quantity_code"]
                if not isinstance(entity_id, UUID) or not isinstance(quantity_code, str):
                    raise MessierSelectionError("Invalid Messier selection identity.")
                entity_rows = by_entity.setdefault(entity_id, {})
                if quantity_code in entity_rows:
                    raise MessierSelectionError("Ambiguous Messier selection set.")
                entity_rows[quantity_code] = row
            if any(
                set(values) != {self._profile.right_ascension, self._profile.declination}
                for values in by_entity.values()
            ):
                raise MessierSelectionError("Missing Messier coordinate quantity.")

            active = {
                (row["entity_id"], row["quantity_code"]): row
                for row in (
                    await session.execute(
                        _ACTIVE_SQL,
                        {
                            "right_ascension": self._profile.right_ascension,
                            "declination": self._profile.declination,
                        },
                    )
                ).mappings()
            }
            fingerprint_rows: list[dict[str, object]] = []
            inserted_count = unchanged_count = superseded_count = 0
            for entity_id, values in by_entity.items():
                for quantity_code, row in values.items():
                    active_row = active.get((entity_id, quantity_code))
                    measurement_id = row["measurement_id"]
                    if not isinstance(measurement_id, UUID):
                        raise MessierSelectionError("Invalid Messier measurement identity.")
                    selection_id = _selection_id(entity_id, quantity_code, measurement_id)
                    if active_row is not None and (
                        active_row["measurement_id"] == measurement_id
                        and active_row["selection_rule"] == self._profile.selection_rule
                        and active_row["selection_version"] == self._profile.selection_version
                        and active_row["explanation"] == self._profile.explanation
                    ):
                        unchanged_count += 1
                    else:
                        if active_row is not None:
                            await session.execute(_SUPERSEDE_SQL, {"id": active_row["id"]})
                            superseded_count += 1
                        await session.execute(
                            _INSERT_SELECTION_SQL,
                            {
                                "id": selection_id,
                                "entity_id": entity_id,
                                "quantity_code": quantity_code,
                                "measurement_id": measurement_id,
                                "selection_rule": self._profile.selection_rule,
                                "selection_version": self._profile.selection_version,
                                "explanation": self._profile.explanation,
                            },
                        )
                        inserted_count += 1
                    fingerprint_rows.append(
                        {
                            "provider_code": row["provider_code"],
                            "dataset_code": row["dataset_code"],
                            "release_version": row["release_version"],
                            "provider_record_id": row["provider_record_id"],
                            "slug": row["slug"],
                            "canonical_name": row["canonical_name"],
                            "quantity_code": quantity_code,
                            "source_fact_key": row["source_fact_key"],
                            "original_value": row["original_value"],
                            "original_unit": row["original_unit"],
                            "value_numeric": str(row["value_numeric"]),
                            "selection_rule": self._profile.selection_rule,
                            "selection_version": self._profile.selection_version,
                            "explanation": self._profile.explanation,
                        }
                    )
            return MessierSelectionResult(
                fingerprint=_fingerprint(
                    fingerprint_rows,
                    schema_version=self._profile.fingerprint_schema_version,
                ),
                inserted_count=inserted_count,
                unchanged_count=unchanged_count,
                superseded_count=superseded_count,
            )


__all__ = [
    "MessierSelectionError",
    "MessierSelectionProfile",
    "MessierSelectionResult",
    "MESSIER_V2_SELECTION_SHA256",
    "PostgreSqlMessierCanonicalSelectionStore",
    "V1_SELECTION_PROFILE",
    "V2_EXPLANATION",
    "V2_SELECTION_PROFILE",
    "V2_SELECTION_RULE",
    "V2_SELECTION_VERSION",
]
