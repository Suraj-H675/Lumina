import { axe } from "jest-axe";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  request: vi.fn(),
  statusEndpoint: vi.fn((submissionId: string) => ({
    method: "GET",
    path: `/api/v1/identification/submissions/${submissionId}`,
  })),
}));

vi.mock("@lumina/api-client", () => ({
  createIdentificationSubmission: fake.create,
  deleteIdentificationSubmission: fake.delete,
  identificationStatusEndpoint: fake.statusEndpoint,
  requestEndpoint: fake.request,
}));

import { IdentifyView } from "../src/app/identify/identify-view";

const submissionId = "71000000-0000-4000-8000-000000000001";
const jobId = "72000000-0000-4000-8000-000000000001";
const capabilities = {
  accepted_media_types: ["image/jpeg", "image/png"] as Array<"image/jpeg" | "image/png">,
  deletion_supported: true as const,
  max_bytes: 25 * 1024 * 1024,
  max_pixels: 50_000_000,
  min_dimension_px: 32 as const,
  remote_processing: false as const,
  retention_hours: 24,
  solver_type: "fake" as const,
};

beforeEach(() => {
  fake.create.mockReset();
  fake.delete.mockReset();
  fake.request.mockReset();
  fake.statusEndpoint.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Phase 6A identify consent and deletion flow", () => {
  it("renders the authoritative privacy policy and requires explicit temporary-processing consent", async () => {
    const { container } = render(
      <IdentifyView apiOrigin="http://127.0.0.1:8000" capabilities={capabilities} />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Identify an astronomical image" }),
    ).toBeVisible();
    expect(screen.getByText(/No remote plate-solving service is contacted/i)).toBeVisible();
    expect(screen.getByText(/configured retention period is 24 hours/i)).toBeVisible();
    expect(screen.getByText(/25 MiB and 50,000,000 pixels/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Start private infrastructure check" }),
    ).toBeDisabled();
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("rejects an unsupported browser-selected media type before any upload request", async () => {
    const user = userEvent.setup();
    render(<IdentifyView apiOrigin="http://127.0.0.1:8000" capabilities={capabilities} />);

    fireEvent.change(screen.getByLabelText("JPEG or PNG image"), {
      target: { files: [new File(["private"], "private.txt", { type: "text/plain" })] },
    });
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Start private infrastructure check" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Choose a JPEG or PNG image.");
    expect(fake.create).not.toHaveBeenCalled();
  });

  it("uploads a private image, exposes only the opaque job id, and requires two-step deletion", async () => {
    fake.create.mockResolvedValue({
      data: {
        job_id: jobId,
        remote_processing: false,
        retention_hours: 24,
        solver_type: "fake",
        status: "queued",
        submission_id: submissionId,
      },
      kind: "ok",
      status: 202,
    });
    fake.delete.mockResolvedValue({ data: null, kind: "ok", status: 204 });
    const user = userEvent.setup();
    render(<IdentifyView apiOrigin="http://127.0.0.1:8000" capabilities={capabilities} />);

    const file = new File(["private-image"], "night.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("JPEG or PNG image"), file);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Start private infrastructure check" }));

    expect(fake.create).toHaveBeenCalledWith("http://127.0.0.1:8000", file, "night.png");
    const statusRegion = screen.getByRole("region", {
      name: "Identification infrastructure status",
    });
    expect(within(statusRegion).getByText(new RegExp(jobId))).toBeVisible();
    expect(document.body.textContent).not.toContain(submissionId);

    await user.click(within(statusRegion).getByRole("button", { name: "Delete temporary upload" }));
    expect(within(statusRegion).getByRole("button", { name: "Confirm delete" })).toBeVisible();
    await user.click(within(statusRegion).getByRole("button", { name: "Confirm delete" }));

    await waitFor(() =>
      expect(fake.delete).toHaveBeenCalledWith("http://127.0.0.1:8000", submissionId),
    );
    expect(screen.getByRole("status", { name: "Temporary submission deleted" })).toBeVisible();
  });

  it("polls the generated status endpoint and labels fake success as non-astrometric", async () => {
    fake.create.mockResolvedValue({
      data: {
        job_id: jobId,
        remote_processing: false,
        retention_hours: 24,
        solver_type: "fake",
        status: "queued",
        submission_id: submissionId,
      },
      kind: "ok",
      status: 202,
    });
    fake.request.mockResolvedValue({
      data: {
        completed_at: "2026-09-15T12:00:01Z",
        created_at: "2026-09-15T12:00:00Z",
        deleted_at: null,
        error_code: null,
        job_id: jobId,
        progress: 1,
        remote_processing: false,
        result: {
          outcome: "fixture_solved",
          solver_type: "fake",
          solver_version: "phase6a-fixture-v1",
          synthetic: true,
        },
        retention_hours: 24,
        solver_type: "fake",
        status: "succeeded",
        submission_id: submissionId,
      },
      kind: "ok",
      status: 200,
    });
    const user = userEvent.setup();
    render(<IdentifyView apiOrigin="http://127.0.0.1:8000" capabilities={capabilities} />);

    await user.upload(
      screen.getByLabelText("JPEG or PNG image"),
      new File(["private"], "night.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Start private infrastructure check" }));
    await waitFor(() => expect(fake.request).toHaveBeenCalledOnce(), { timeout: 2_500 });
    expect(screen.getByText("Fake solver completed", { exact: true })).toBeVisible();
    expect(screen.getByText(/This is not an astrometric solution/i)).toBeVisible();
    expect(screen.queryByText(/RA\/Dec/i)).toBeVisible();
  });
});
