import { describe, expect, it, vi } from "vitest";

import {
  createIdentificationSubmission,
  deleteIdentificationSubmission,
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

  it("accepts only exact generated status payloads", () => {
    const status = {
      completed_at: null,
      created_at: "2026-09-15T12:00:00Z",
      deleted_at: null,
      error_code: null,
      job_id: jobId,
      progress: 0,
      remote_processing: false,
      result: null,
      retention_hours: 24,
      solver_type: "fake",
      status: "queued" as const,
      submission_id: submissionId,
    };
    expect(validateIdentificationStatus(status)).not.toBeNull();
    expect(validateIdentificationStatus({ ...status, filename: "private.png" })).toBeNull();
  });
});
