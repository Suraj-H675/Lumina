import type { ZodType } from "zod";

import type {
  ApodResponse,
  NearEarthResponse,
  LaunchDetailResponse,
  LaunchListResponse,
  SpaceWeatherResponse,
  CatalogSearchResponse,
  CatalogSuggestResponse,
  CalculateEclipseSimulatorData,
  CalculateOrbitSandboxData,
  CalculateRadialVelocityData,
  CalculateSeasonsSimulatorData,
  CalculateSpectroscopyLabData,
  CalculateStellarLaboratoryData,
  CalculateTelescopeBuilderData,
  CalculateTransitMethodData,
  OrbitSandboxCalculationResponse,
  RadialVelocityCalculationResponse,
  SpectroscopyCalculationResponse,
  StellarLaboratoryCalculationResponse,
  TelescopeBuilderCalculationResponse,
  SeasonsCalculationResponse,
  TransitMethodCalculationResponse,
  EntityBrowsePageResponse,
  EntityDetailResponse,
  EntitySummaryResponse,
  EclipseSimulatorCalculationResponse,
  GetCatalogEntityBySlugData,
  GetCatalogEntityData,
  GetNowApodData,
  GetIdentificationCapabilitiesData,
  GetIdentificationSubmissionData,
  GetIdentificationSolutionData,
  IdentificationCapabilitiesResponse,
  IdentificationSolutionResponse,
  IdentificationStatusResponse,
  GetNowLaunchData,
  GetNowLaunchesData,
  GetNowNearEarthData,
  GetNowSatellitesData,
  GetNowSpaceWeatherData,
  PostNowSatellitePassesData,
  SatelliteListResponse,
  SatellitePassRequest,
  SatellitePassResponse,
  ListCatalogEntitiesData,
  ListProviderStatusData,
  ProviderStatusListResponse as GeneratedProviderStatusListResponse,
  LiveHealthLiveGetData,
  LiveHealthLiveGetResponse,
  MetadataApiV1MetaGetData,
  MetadataApiV1MetaGetResponse,
  ReadyHealthReadyGetData,
  ReadyHealthReadyGetResponse,
  SearchCatalogEntitiesData,
  SuggestCatalogEntitiesData,
} from "./generated/types.gen";
import {
  zCatalogSearchResponse,
  zCatalogSuggestResponse,
  zCalculateEclipseSimulatorResponse,
  zCalculateOrbitSandboxResponse,
  zCalculateRadialVelocityResponse,
  zCalculateSeasonsSimulatorResponse,
  zCalculateSpectroscopyLabResponse,
  zCalculateStellarLaboratoryResponse,
  zCalculateTelescopeBuilderResponse,
  zCalculateTransitMethodResponse,
  zEntityBrowsePageResponse,
  zEntityDetailResponse,
  zEntitySummaryResponse,
  zGetNowApodResponse,
  zGetIdentificationCapabilitiesResponse,
  zGetIdentificationSubmissionResponse,
  zGetIdentificationSolutionResponse,
  zGetNowLaunchResponse,
  zGetNowLaunchesResponse,
  zGetNowNearEarthResponse,
  zGetNowSatellitesResponse,
  zGetNowSpaceWeatherResponse,
  zPostNowSatellitePassesResponse,
  zSatellitePassRequest,
  zLiveResponse,
  zMetaResponse,
  zProviderStatusListResponse,
  zReadyResponse,
} from "./generated/zod.gen";

export type LiveResponse = LiveHealthLiveGetResponse;
export type ReadyResponse = ReadyHealthReadyGetResponse;
export type MetaResponse = MetadataApiV1MetaGetResponse;
export type ProviderStatusListResponse = GeneratedProviderStatusListResponse;
export type {
  ApodResponse,
  LaunchDetailResponse,
  LaunchListResponse,
  NearEarthResponse,
  SatelliteListResponse,
  SatellitePassRequest,
  SatellitePassResponse,
  SpaceWeatherResponse,
};

export type GeneratedValidator<T> = Pick<ZodType<T>, "safeParse">;

export type ApiEndpoint<
  T,
  Path extends string = string,
  Method extends "GET" | "POST" = "GET",
> = Readonly<{
  maxResponseBytes?: number;
  method: Method;
  path: Path;
  validator: GeneratedValidator<T>;
}>;

export type ApiJsonEndpoint<TResponse, TRequest, Path extends string = string> = ApiEndpoint<
  TResponse,
  Path,
  "POST"
> &
  Readonly<{
    requestValidator: GeneratedValidator<TRequest>;
  }>;

export const liveEndpoint = {
  method: "GET",
  path: "/health/live" satisfies LiveHealthLiveGetData["url"],
  validator: zLiveResponse,
} satisfies ApiEndpoint<LiveResponse, LiveHealthLiveGetData["url"]>;

export const readyEndpoint = {
  method: "GET",
  path: "/health/ready" satisfies ReadyHealthReadyGetData["url"],
  validator: zReadyResponse,
} satisfies ApiEndpoint<ReadyResponse, ReadyHealthReadyGetData["url"]>;

export const metaEndpoint = {
  method: "GET",
  path: "/api/v1/meta" satisfies MetadataApiV1MetaGetData["url"],
  validator: zMetaResponse,
} satisfies ApiEndpoint<MetaResponse, MetadataApiV1MetaGetData["url"]>;

const identificationCapabilitiesValidator = zGetIdentificationCapabilitiesResponse.superRefine(
  (value, context) => {
    if ((value.solver_type === "nova") !== value.remote_processing) {
      context.addIssue({ code: "custom", message: "incoherent identification mode" });
    }
  },
);

export const identificationCapabilitiesEndpoint = {
  method: "GET",
  path: "/api/v1/identification/capabilities" satisfies GetIdentificationCapabilitiesData["url"],
  validator: identificationCapabilitiesValidator,
} satisfies ApiEndpoint<
  IdentificationCapabilitiesResponse,
  GetIdentificationCapabilitiesData["url"]
>;

const fakeIdentificationStates = new Set([
  "queued",
  "running",
  "succeeded",
  "failed",
  "dead_letter",
  "deleted",
]);
const novaIdentificationStates = new Set([
  "submitting",
  "waiting_for_solver",
  "solving",
  "fetching_results",
  "succeeded",
  "unsolved",
  "failed",
  "expired",
  "deleted",
]);

export const identificationStatusValidator = zGetIdentificationSubmissionResponse.superRefine(
  (value, context) => {
    const fake =
      value.solver_type === "fake" &&
      !value.remote_processing &&
      value.job_id !== null &&
      fakeIdentificationStates.has(value.status) &&
      !value.solution_available &&
      value.remote_condition === null &&
      (value.status === "succeeded") === (value.result !== null);
    const novaPollable = new Set([
      "submitting",
      "waiting_for_solver",
      "solving",
      "fetching_results",
    ]).has(value.status);
    const novaCondition =
      value.remote_condition === null ||
      (value.remote_condition === "provider_unavailable" && novaPollable) ||
      (value.remote_condition === "provider_busy" && (novaPollable || value.status === "failed"));
    const nova =
      value.solver_type === "nova" &&
      value.remote_processing &&
      value.job_id === null &&
      novaIdentificationStates.has(value.status) &&
      value.result === null &&
      novaCondition &&
      (!novaPollable || value.error_code === null) &&
      (value.error_code === "provider_busy") ===
        (value.remote_condition === "provider_busy" && value.status === "failed") &&
      value.solution_available === (value.status === "succeeded");
    if (!(fake || nova)) {
      context.addIssue({ code: "custom", message: "incoherent identification status" });
    }
  },
);

export const identificationStatusTemplateEndpoint = {
  method: "GET",
  path: "/api/v1/identification/submissions/{submission_id}" satisfies GetIdentificationSubmissionData["url"],
  validator: identificationStatusValidator,
} satisfies ApiEndpoint<IdentificationStatusResponse, GetIdentificationSubmissionData["url"]>;

export function identificationStatusEndpoint(
  submissionId: string,
): ApiEndpoint<IdentificationStatusResponse> {
  return {
    method: "GET",
    path: `/api/v1/identification/submissions/${encodeURIComponent(submissionId)}`,
    validator: identificationStatusValidator,
  };
}

export const identificationSolutionTemplateEndpoint = {
  method: "GET",
  path: "/api/v1/identification/submissions/{submission_id}/solution" satisfies GetIdentificationSolutionData["url"],
  validator: zGetIdentificationSolutionResponse,
} satisfies ApiEndpoint<IdentificationSolutionResponse, GetIdentificationSolutionData["url"]>;

export function identificationSolutionEndpoint(
  submissionId: string,
  cursor?: string | null,
): ApiEndpoint<IdentificationSolutionResponse> {
  const base = `/api/v1/identification/submissions/${encodeURIComponent(submissionId)}/solution`;
  return {
    method: "GET",
    path: cursor == null ? base : `${base}?cursor=${encodeURIComponent(cursor)}`,
    validator: zGetIdentificationSolutionResponse,
  };
}

export const providerStatusEndpoint = {
  method: "GET",
  path: "/api/v1/providers/status" satisfies ListProviderStatusData["url"],
  validator: zProviderStatusListResponse,
} satisfies ApiEndpoint<ProviderStatusListResponse, ListProviderStatusData["url"]>;

export const apodEndpoint = {
  method: "GET",
  path: "/api/v1/now/apod" satisfies GetNowApodData["url"],
  validator: zGetNowApodResponse,
} satisfies ApiEndpoint<ApodResponse, GetNowApodData["url"]>;

export const launchesEndpoint = {
  method: "GET",
  path: "/api/v1/now/launches" satisfies GetNowLaunchesData["url"],
  validator: zGetNowLaunchesResponse,
} satisfies ApiEndpoint<LaunchListResponse, GetNowLaunchesData["url"]>;

export const launchDetailTemplateEndpoint = {
  method: "GET",
  path: "/api/v1/now/launches/{launch_id}" satisfies GetNowLaunchData["url"],
  validator: zGetNowLaunchResponse,
} satisfies ApiEndpoint<LaunchDetailResponse, GetNowLaunchData["url"]>;

export function launchDetailEndpoint(launchId: string): ApiEndpoint<LaunchDetailResponse> {
  return {
    method: "GET",
    path: `/api/v1/now/launches/${encodeURIComponent(launchId)}`,
    validator: zGetNowLaunchResponse,
  };
}

export const nearEarthEndpoint = {
  method: "GET",
  path: "/api/v1/now/near-earth" satisfies GetNowNearEarthData["url"],
  validator: zGetNowNearEarthResponse,
} satisfies ApiEndpoint<NearEarthResponse, GetNowNearEarthData["url"]>;

export const satellitesEndpoint = {
  method: "GET",
  path: "/api/v1/now/satellites" satisfies GetNowSatellitesData["url"],
  validator: zGetNowSatellitesResponse,
} satisfies ApiEndpoint<SatelliteListResponse, GetNowSatellitesData["url"]>;

export const satellitePassEndpoint = {
  method: "POST",
  path: "/api/v1/now/satellites/passes" satisfies PostNowSatellitePassesData["url"],
  requestValidator: zSatellitePassRequest,
  validator: zPostNowSatellitePassesResponse,
} satisfies ApiJsonEndpoint<
  SatellitePassResponse,
  SatellitePassRequest,
  PostNowSatellitePassesData["url"]
>;

export const spaceWeatherEndpoint = {
  method: "GET",
  path: "/api/v1/now/space-weather" satisfies GetNowSpaceWeatherData["url"],
  validator: zGetNowSpaceWeatherResponse,
} satisfies ApiEndpoint<SpaceWeatherResponse, GetNowSpaceWeatherData["url"]>;

export const catalogSearchEndpoint = {
  method: "GET",
  path: "/api/v1/search" satisfies SearchCatalogEntitiesData["url"],
  validator: zCatalogSearchResponse,
} satisfies ApiEndpoint<CatalogSearchResponse, SearchCatalogEntitiesData["url"]>;

export const catalogSuggestEndpoint = {
  method: "GET",
  path: "/api/v1/search/suggest" satisfies SuggestCatalogEntitiesData["url"],
  validator: zCatalogSuggestResponse,
} satisfies ApiEndpoint<CatalogSuggestResponse, SuggestCatalogEntitiesData["url"]>;

export const catalogEntitiesEndpoint = {
  method: "GET",
  path: "/api/v1/catalog/entities" satisfies ListCatalogEntitiesData["url"],
  validator: zEntityBrowsePageResponse,
} satisfies ApiEndpoint<EntityBrowsePageResponse, ListCatalogEntitiesData["url"]>;

export const catalogEntityBySlugEndpoint = {
  method: "GET",
  path: "/api/v1/catalog/entities/by-slug/{slug}" satisfies GetCatalogEntityBySlugData["url"],
  validator: zEntitySummaryResponse,
} satisfies ApiEndpoint<EntitySummaryResponse, GetCatalogEntityBySlugData["url"]>;

export const catalogEntityDetailEndpoint = {
  method: "GET",
  path: "/api/v1/catalog/entities/{entity_id}" satisfies GetCatalogEntityData["url"],
  validator: zEntityDetailResponse,
} satisfies ApiEndpoint<EntityDetailResponse, GetCatalogEntityData["url"]>;

// The reviewed v1 contract permits 4,096 trajectory samples. A canonical
// 4,096-sample response is about 525 KiB; 1 MiB leaves bounded headroom for
// finite-number string length variation and the fixed response envelope.
export const ORBIT_SANDBOX_MAX_RESPONSE_BYTES = 1_048_576;

export const orbitSandboxEndpoint = {
  maxResponseBytes: ORBIT_SANDBOX_MAX_RESPONSE_BYTES,
  method: "GET",
  path: "/api/v1/simulations/orbit-sandbox" satisfies CalculateOrbitSandboxData["url"],
  validator: zCalculateOrbitSandboxResponse,
} satisfies ApiEndpoint<OrbitSandboxCalculationResponse, CalculateOrbitSandboxData["url"]>;

export const eclipseSimulatorEndpoint = {
  method: "GET",
  path: "/api/v1/simulations/eclipse-simulator" satisfies CalculateEclipseSimulatorData["url"],
  validator: zCalculateEclipseSimulatorResponse,
} satisfies ApiEndpoint<EclipseSimulatorCalculationResponse, CalculateEclipseSimulatorData["url"]>;

export const radialVelocityEndpoint = {
  method: "GET",
  path: "/api/v1/simulations/radial-velocity" satisfies CalculateRadialVelocityData["url"],
  validator: zCalculateRadialVelocityResponse,
} satisfies ApiEndpoint<RadialVelocityCalculationResponse, CalculateRadialVelocityData["url"]>;

export const seasonsSimulatorEndpoint = {
  method: "GET",
  path: "/api/v1/simulations/seasons" satisfies CalculateSeasonsSimulatorData["url"],
  validator: zCalculateSeasonsSimulatorResponse,
} satisfies ApiEndpoint<SeasonsCalculationResponse, CalculateSeasonsSimulatorData["url"]>;

export const spectroscopyLabEndpoint = {
  method: "GET",
  path: "/api/v1/simulations/spectroscopy-lab" satisfies CalculateSpectroscopyLabData["url"],
  validator: zCalculateSpectroscopyLabResponse,
} satisfies ApiEndpoint<SpectroscopyCalculationResponse, CalculateSpectroscopyLabData["url"]>;

export const stellarLaboratoryEndpoint = {
  method: "GET",
  path: "/api/v1/simulations/stellar-laboratory" satisfies CalculateStellarLaboratoryData["url"],
  validator: zCalculateStellarLaboratoryResponse,
} satisfies ApiEndpoint<
  StellarLaboratoryCalculationResponse,
  CalculateStellarLaboratoryData["url"]
>;

export const telescopeBuilderEndpoint = {
  method: "GET",
  path: "/api/v1/simulations/telescope-builder" satisfies CalculateTelescopeBuilderData["url"],
  validator: zCalculateTelescopeBuilderResponse,
} satisfies ApiEndpoint<TelescopeBuilderCalculationResponse, CalculateTelescopeBuilderData["url"]>;

export const transitMethodEndpoint = {
  method: "GET",
  path: "/api/v1/simulations/transit-method" satisfies CalculateTransitMethodData["url"],
  validator: zCalculateTransitMethodResponse,
} satisfies ApiEndpoint<TransitMethodCalculationResponse, CalculateTransitMethodData["url"]>;

export type ValidationResult<T> = Readonly<{ data: T; valid: true }> | Readonly<{ valid: false }>;

function hasExactShape(input: unknown, parsed: unknown): boolean {
  if (Array.isArray(input) || Array.isArray(parsed)) {
    return (
      Array.isArray(input) &&
      Array.isArray(parsed) &&
      input.length === parsed.length &&
      input.every((value, index) => hasExactShape(value, parsed[index]))
    );
  }
  if (
    input === null ||
    parsed === null ||
    typeof input !== "object" ||
    typeof parsed !== "object"
  ) {
    return true;
  }

  const inputRecord = input as Record<string, unknown>;
  const parsedRecord = parsed as Record<string, unknown>;
  const inputKeys = Object.keys(inputRecord).sort();
  const parsedKeys = Object.keys(parsedRecord).sort();
  return (
    inputKeys.length === parsedKeys.length &&
    inputKeys.every(
      (key, index) =>
        key === parsedKeys[index] && hasExactShape(inputRecord[key], parsedRecord[key]),
    )
  );
}

export function validateExactGenerated<T>(
  validator: GeneratedValidator<T>,
  input: unknown,
): ValidationResult<T> {
  const result = validator.safeParse(input);
  if (!result.success || !hasExactShape(input, result.data)) {
    return { valid: false };
  }
  return { data: result.data, valid: true };
}
