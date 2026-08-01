import type { ZodType } from "zod";

import type {
  LiveHealthLiveGetData,
  LiveHealthLiveGetResponse,
  MetadataApiV1MetaGetData,
  MetadataApiV1MetaGetResponse,
  ReadyHealthReadyGetData,
  ReadyHealthReadyGetResponse,
} from "./generated/types.gen";
import { zLiveResponse, zMetaResponse, zReadyResponse } from "./generated/zod.gen";

export type LiveResponse = LiveHealthLiveGetResponse;
export type ReadyResponse = ReadyHealthReadyGetResponse;
export type MetaResponse = MetadataApiV1MetaGetResponse;

export type GeneratedValidator<T> = Pick<ZodType<T>, "safeParse">;

export type ApiEndpoint<T, Path extends string = string> = Readonly<{
  method: "GET";
  path: Path;
  validator: GeneratedValidator<T>;
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
