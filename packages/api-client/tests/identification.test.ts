import { describe, expect, it, vi } from "vitest";

import {
  createIdentificationSubmission,
  deleteIdentificationSubmission,
  getIdentificationSolution,
  identificationCapabilitiesEndpoint,
  identificationSolutionEndpoint,
  IDENTIFICATION_SOLUTION_MAX_RESPONSE_BYTES,
  identificationStatusEndpoint,
  validateIdentificationStatus,
} from "../src/index";

const submissionId = "71000000-0000-4000-8000-000000000001";
const jobId = "72000000-0000-4000-8000-000000000001";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("Phase 6A identification transport", () => {
  it("rejects incoherent advertised solver capabilities", () => {
    const base = {
      accepted_media_types: ["image/jpeg", "image/png"],
      deletion_supported: true,
      max_bytes: 25 * 1024 * 1024,
      max_pixels: 50_000_000,
      min_dimension_px: 32,
      retention_hours: 24,
    };
    expect(
      identificationCapabilitiesEndpoint.validator.safeParse({
        ...base,
        remote_processing: false,
        solver_type: "fake",
      }).success,
    ).toBe(true);
    expect(
      identificationCapabilitiesEndpoint.validator.safeParse({
        ...base,
        remote_processing: true,
        solver_type: "nova",
      }).success,
    ).toBe(true);
    expect(
      identificationCapabilitiesEndpoint.validator.safeParse({
        ...base,
        remote_processing: true,
        solver_type: "fake",
      }).success,
    ).toBe(false);
  });
  it("uploads with browser-owned multipart boundaries and validates the generated response", async () => {
    const fetchImplementation = vi.fn<typeof fetch>((_input, init) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ Accept: "application/json" });
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init?.body as FormData;
      expect(form.get("consent_remote_processing")).toBe("false");
      expect(form.get("file")).toBeInstanceOf(Blob);
      return Promise.resolve(
        jsonResponse(
          {
            job_id: jobId,
            remote_processing: false,
            retention_hours: 24,
            solver_type: "fake",
            status: "queued",
            submission_id: submissionId,
          },
          202,
        ),
      );
    });

    const result = await createIdentificationSubmission(
      "http://127.0.0.1:8000",
      new Blob(["private-image"], { type: "image/png" }),
      "night.png",
      { fetchImplementation },
    );

    expect(result).toMatchObject({ kind: "ok", status: 202 });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("sends explicit Nova consent and accepts only the coherent remote creation shape", async () => {
    const fetchImplementation = vi.fn<typeof fetch>((_input, init) => {
      const form = init?.body as FormData;
      expect(form.get("consent_remote_processing")).toBe("true");
      return Promise.resolve(
        jsonResponse(
          {
            job_id: null,
            remote_processing: true,
            retention_hours: 24,
            solver_type: "nova",
            status: "submitting",
            submission_id: submissionId,
          },
          202,
        ),
      );
    });

    const result = await createIdentificationSubmission(
      "http://127.0.0.1:8000",
      new Blob(["private-image"], { type: "image/png" }),
      "night.png",
      { consentRemoteProcessing: true, fetchImplementation },
    );

    expect(result).toMatchObject({
      data: { job_id: null, remote_processing: true, solver_type: "nova", status: "submitting" },
      kind: "ok",
      status: 202,
    });
  });

  it.each([
    { job_id: null, remote_processing: false, solver_type: "fake", status: "queued" },
    { job_id: jobId, remote_processing: true, solver_type: "nova", status: "submitting" },
    { job_id: null, remote_processing: true, solver_type: "nova", status: "queued" },
  ])("rejects schema-valid but incoherent create mode %#", async (mode) => {
    const result = await createIdentificationSubmission(
      "http://127.0.0.1:8000",
      new Blob(["x"], { type: "image/png" }),
      "night.png",
      {
        consentRemoteProcessing: mode.remote_processing,
        fetchImplementation: vi.fn(() =>
          Promise.resolve(
            jsonResponse(
              {
                ...mode,
                retention_hours: 24,
                submission_id: submissionId,
              },
              202,
            ),
          ),
        ),
      },
    );

    expect(result).toEqual({ kind: "malformed-response" });
  });

  it("rejects response shape drift instead of accepting extra private fields", async () => {
    const result = await createIdentificationSubmission(
      "http://127.0.0.1:8000",
      new Blob(["x"], { type: "image/png" }),
      "night.png",
      {
        fetchImplementation: vi.fn(() =>
          Promise.resolve(
            jsonResponse(
              {
                job_id: jobId,
                remote_processing: false,
                retention_hours: 24,
                solver_type: "fake",
                status: "queued",
                submission_id: submissionId,
                storage_key: "must-not-leak",
              },
              202,
            ),
          ),
        ),
      },
    );

    expect(result).toEqual({ kind: "malformed-response" });
  });

  it("requires canonical UUIDv4 paths before issuing delete requests", async () => {
    const fetchImplementation = vi.fn<typeof fetch>((_input, init) => {
      expect(init?.method).toBe("DELETE");
      return Promise.resolve(new Response(null, { status: 204 }));
    });

    expect(
      await deleteIdentificationSubmission("http://127.0.0.1:8000", submissionId, {
        fetchImplementation,
      }),
    ).toEqual({ data: null, kind: "ok", status: 204 });
    expect(fetchImplementation).toHaveBeenCalledOnce();

    expect(
      await deleteIdentificationSubmission(
        "http://127.0.0.1:8000",
        "71ABCDEF-0000-4000-8000-000000000001",
        {
          fetchImplementation,
        },
      ),
    ).toEqual({ kind: "unavailable", reason: "transport" });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("builds only the bounded identification status path", () => {
    expect(identificationStatusEndpoint(submissionId)).toMatchObject({
      method: "GET",
      path: `/api/v1/identification/submissions/${submissionId}`,
    });
  });

  it("fetches one exact bounded normalized solution page", async () => {
    const cursor = "eyJrIjoic29sdXRpb25fYW5ub3RhdGlvbnMifQ";
    const fetchImplementation = vi.fn<typeof fetch>((input, init) => {
      const url =
        input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
      expect(url.pathname).toBe(`/api/v1/identification/submissions/${submissionId}/solution`);
      expect(url.searchParams.get("cursor")).toBe(cursor);
      expect(init).toMatchObject({
        cache: "no-store",
        headers: { Accept: "application/json" },
        method: "GET",
        redirect: "error",
      });
      return Promise.resolve(
        jsonResponse({
          annotations: [],
          calibration: {
            center_dec_deg: 20,
            center_ra_deg: 120,
            orientation_deg: 45,
            parity: -1,
            pixel_scale_arcsec_per_pixel: 1.2,
            radius_deg: 0.5,
          },
          has_more: false,
          next_cursor: null,
          remote_processing: true,
          solver_name: "astrometry.net-nova",
          solver_type: "nova",
          solver_version: null,
          submission_id: submissionId,
          wcs: {
            coordinate_frame: "fk5_j2000",
            header: "WCSAXES =                    2",
            image_height: 800,
            image_width: 1000,
            source_sha256: "e".repeat(64),
          },
        }),
      );
    });

    const result = await getIdentificationSolution("http://127.0.0.1:8000", submissionId, cursor, {
      fetchImplementation,
    });

    expect(result).toMatchObject({ kind: "ok", status: 200 });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("accepts a schema-valid near-worst-case normalized solution under the dedicated cap", async () => {
    const annotation = {
      category: "a".repeat(32),
      dec_deg: -90,
      names: Array.from({ length: 16 }, () => "漢".repeat(128)),
      pixel_x: Number.MAX_VALUE,
      pixel_y: Number.MAX_VALUE,
      ra_deg: 359.99999999999994,
    };
    const payload = {
      annotations: Array.from({ length: 50 }, () => annotation),
      calibration: {
        center_dec_deg: -90,
        center_ra_deg: 359.99999999999994,
        orientation_deg: 359.99999999999994,
        parity: -1,
        pixel_scale_arcsec_per_pixel: 36_000,
        radius_deg: 180,
      },
      has_more: true,
      next_cursor: "A".repeat(512),
      remote_processing: true,
      solver_name: "astrometry.net-nova",
      solver_type: "nova",
      solver_version: "v".repeat(64),
      submission_id: submissionId,
      wcs: {
        coordinate_frame: "fk5_j2000",
        header: "\u0000".repeat(65_536),
        image_height: 100_000,
        image_width: 100_000,
        source_sha256: "e".repeat(64),
      },
    };
    const encoded = new TextEncoder().encode(JSON.stringify(payload));
    expect(encoded.byteLength).toBeLessThan(IDENTIFICATION_SOLUTION_MAX_RESPONSE_BYTES);

    const result = await getIdentificationSolution("http://127.0.0.1:8000", submissionId, null, {
      fetchImplementation: vi.fn(() => Promise.resolve(jsonResponse(payload))),
    });

    expect(result).toMatchObject({ kind: "ok", status: 200 });
  });

  it("rejects invalid solution cursors and oversized declared responses", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response("{}", {
          headers: {
            "content-length": String(IDENTIFICATION_SOLUTION_MAX_RESPONSE_BYTES + 1),
            "content-type": "application/json",
          },
          status: 200,
        }),
      ),
    );

    expect(
      await getIdentificationSolution("http://127.0.0.1:8000", submissionId, "bad cursor", {
        fetchImplementation,
      }),
    ).toEqual({ kind: "unavailable", reason: "transport" });
    expect(fetchImplementation).not.toHaveBeenCalled();

    expect(
      await getIdentificationSolution("http://127.0.0.1:8000", submissionId, null, {
        fetchImplementation,
      }),
    ).toEqual({ kind: "malformed-response" });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("builds the normalized solution endpoint without accepting raw path text", () => {
    expect(identificationSolutionEndpoint(submissionId, "abc_DEF-123")).toMatchObject({
      method: "GET",
      path: `/api/v1/identification/submissions/${submissionId}/solution?cursor=abc_DEF-123`,
    });
  });

  it("accepts only exact generated status payloads", () => {
    const status = {
      completed_at: null,
      created_at: "2026-09-15T12:00:00Z",
      deleted_at: null,
      error_code: null,
      job_id: jobId,
      progress: 0,
      remote_condition: null,
      remote_processing: false,
      result: null,
      retention_hours: 24,
      solution_available: false,
      solver_type: "fake",
      status: "queued" as const,
      submission_id: submissionId,
    };
    expect(validateIdentificationStatus(status)).not.toBeNull();
    expect(validateIdentificationStatus({ ...status, filename: "private.png" })).toBeNull();

    const novaStatus = {
      ...status,
      job_id: null,
      progress: null,
      remote_processing: true,
      solution_available: true,
      solver_type: "nova" as const,
      status: "succeeded" as const,
    };
    expect(validateIdentificationStatus(novaStatus)).not.toBeNull();
    expect(
      validateIdentificationStatus({
        ...novaStatus,
        remote_condition: "provider_unavailable",
        solution_available: false,
        status: "solving",
      }),
    ).not.toBeNull();
    expect(
      validateIdentificationStatus({
        ...novaStatus,
        error_code: "provider_busy",
        remote_condition: "provider_busy",
        solution_available: false,
        status: "failed",
      }),
    ).not.toBeNull();
    expect(
      validateIdentificationStatus({ ...status, remote_condition: "provider_busy" }),
    ).toBeNull();
    expect(
      validateIdentificationStatus({
        ...novaStatus,
        remote_condition: "provider_unavailable",
      }),
    ).toBeNull();
    expect(
      validateIdentificationStatus({
        ...novaStatus,
        error_code: "provider_busy",
        remote_condition: null,
        solution_available: false,
        status: "failed",
      }),
    ).toBeNull();
    expect(validateIdentificationStatus({ ...status, remote_processing: true })).toBeNull();
    expect(validateIdentificationStatus({ ...novaStatus, job_id: jobId })).toBeNull();
    expect(validateIdentificationStatus({ ...novaStatus, solution_available: false })).toBeNull();
    expect(
      identificationStatusEndpoint(submissionId).validator.safeParse({
        ...novaStatus,
        status: "running",
      }).success,
    ).toBe(false);
  });
});
