import { axe } from "jest-axe";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  request: vi.fn(),
  solution: vi.fn(),
  statusEndpoint: vi.fn((submissionId: string) => ({
    method: "GET",
    path: `/api/v1/identification/submissions/${submissionId}`,
  })),
}));

vi.mock("@lumina/api-client", () => ({
  createIdentificationSubmission: fake.create,
  deleteIdentificationSubmission: fake.delete,
  getIdentificationSolution: fake.solution,
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
const remoteSolutionBase = {
  calibration: {
    center_dec_deg: -6.2,
    center_ra_deg: 82.5,
    orientation_deg: 12.5,
    parity: 1 as const,
    pixel_scale_arcsec_per_pixel: 1.45,
    radius_deg: 0.72,
  },
  remote_processing: true as const,
  solver_name: "astrometry.net-nova" as const,
  solver_type: "nova" as const,
  solver_version: "nova-fixture-v1",
  submission_id: submissionId,
  wcs: {
    coordinate_frame: "icrs" as const,
    header: "CTYPE1  = 'RA---TAN'",
    image_height: 80,
    image_width: 100,
    source_sha256: "a".repeat(64),
  },
};

const remoteCapabilities = {
  ...capabilities,
  remote_processing: true,
  solver_type: "nova" as const,
};

beforeEach(() => {
  fake.create.mockReset();
  fake.delete.mockReset();
  fake.request.mockReset();
  fake.solution.mockReset();
  fake.statusEndpoint.mockClear();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:local-identification-preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
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

    expect(fake.create).toHaveBeenCalledWith("http://127.0.0.1:8000", file, "night.png", {
      consentRemoteProcessing: false,
    });
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

  it("requires explicit third-party consent before starting a Nova solve", async () => {
    fake.create.mockResolvedValue({
      data: {
        job_id: null,
        remote_processing: true,
        retention_hours: 24,
        solver_type: "nova",
        status: "submitting",
        submission_id: submissionId,
      },
      kind: "ok",
      status: 202,
    });
    const user = userEvent.setup();
    render(<IdentifyView apiOrigin="http://127.0.0.1:8000" capabilities={remoteCapabilities} />);

    expect(screen.getByText(/third-party Astrometry.net Nova service/i)).toBeVisible();
    expect(screen.getByText(/remote deletion and retention/i)).toBeVisible();
    const button = screen.getByRole("button", { name: "Start remote plate solve" });
    expect(button).toBeDisabled();

    const file = new File(["private-image"], "night.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("JPEG or PNG image"), file);
    await user.click(screen.getByRole("checkbox"));
    await user.click(button);

    expect(fake.create).toHaveBeenCalledWith("http://127.0.0.1:8000", file, "night.png", {
      consentRemoteProcessing: true,
    });
    const statusRegion = screen.getByRole("region", {
      name: "Identification infrastructure status",
    });
    expect(within(statusRegion).getByText(/provider identifiers are kept private/i)).toBeVisible();
    expect(within(statusRegion).queryByText(/Job ID:/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(submissionId);
  });

  it("revokes the local Nova preview when a terminal status has no usable solution", async () => {
    fake.create.mockResolvedValue({
      data: {
        job_id: null,
        remote_processing: true,
        retention_hours: 24,
        solver_type: "nova",
        status: "submitting",
        submission_id: submissionId,
      },
      kind: "ok",
      status: 202,
    });
    fake.request.mockResolvedValue({
      data: {
        completed_at: "2026-09-16T12:00:01Z",
        created_at: "2026-09-16T12:00:00Z",
        deleted_at: null,
        error_code: "identification.remote_failed",
        job_id: null,
        progress: null,
        remote_processing: true,
        result: null,
        retention_hours: 24,
        solution_available: false,
        solver_type: "nova",
        status: "failed",
        submission_id: submissionId,
      },
      kind: "ok",
      status: 200,
    });
    const user = userEvent.setup();
    render(<IdentifyView apiOrigin="http://127.0.0.1:8000" capabilities={remoteCapabilities} />);

    await user.upload(
      screen.getByLabelText("JPEG or PNG image"),
      new File(["private"], "night.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Start remote plate solve" }));

    await waitFor(() => expect(fake.request).toHaveBeenCalledOnce(), { timeout: 2_500 });
    await waitFor(() =>
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-identification-preview"),
    );
    expect(fake.solution).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("img", { name: "Solved astronomical image" }),
    ).not.toBeInTheDocument();
  });

  it("loads the normalized Nova solution, paginates annotations, and revokes the local preview on deletion", async () => {
    fake.create.mockResolvedValue({
      data: {
        job_id: null,
        remote_processing: true,
        retention_hours: 24,
        solver_type: "nova",
        status: "submitting",
        submission_id: submissionId,
      },
      kind: "ok",
      status: 202,
    });
    fake.request.mockResolvedValue({
      data: {
        completed_at: "2026-09-16T12:00:01Z",
        created_at: "2026-09-16T12:00:00Z",
        deleted_at: null,
        error_code: null,
        job_id: null,
        progress: null,
        remote_processing: true,
        result: null,
        retention_hours: 24,
        solution_available: true,
        solver_type: "nova",
        status: "succeeded",
        submission_id: submissionId,
      },
      kind: "ok",
      status: 200,
    });
    fake.solution
      .mockResolvedValueOnce({
        data: {
          ...remoteSolutionBase,
          annotations: [
            {
              category: "star",
              dec_deg: -8.2016,
              names: ["Rigel"],
              pixel_x: 24,
              pixel_y: 30,
              ra_deg: 78.6345,
            },
          ],
          has_more: true,
          next_cursor: "fixture_cursor_1",
        },
        kind: "ok",
        status: 200,
      })
      .mockResolvedValueOnce({
        data: {
          ...remoteSolutionBase,
          annotations: [
            {
              category: "deep_sky",
              dec_deg: -5.3911,
              names: ["Orion Nebula", "M42"],
              pixel_x: 68,
              pixel_y: 52,
              ra_deg: 83.8221,
            },
          ],
          has_more: false,
          next_cursor: null,
        },
        kind: "ok",
        status: 200,
      });
    fake.delete.mockResolvedValue({ data: null, kind: "ok", status: 204 });
    const user = userEvent.setup();
    render(<IdentifyView apiOrigin="http://127.0.0.1:8000" capabilities={remoteCapabilities} />);

    await user.upload(
      screen.getByLabelText("JPEG or PNG image"),
      new File(["private"], "night.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Start remote plate solve" }));

    await waitFor(() => expect(fake.request).toHaveBeenCalledOnce(), { timeout: 2_500 });
    await waitFor(() => expect(fake.solution).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("heading", { name: "Solved field and WCS-backed annotations" }),
    ).toBeVisible();
    expect(screen.getAllByText("Rigel").length).toBeGreaterThan(0);
    expect(URL.createObjectURL).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Load more annotations" }));
    await waitFor(() => expect(fake.solution).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/M42/)).toBeVisible();
    expect(screen.getByText(/All available annotation pages are loaded/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Delete temporary upload" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(fake.delete).toHaveBeenCalledOnce());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-identification-preview");
    expect(
      screen.queryByRole("heading", { name: "Solved field and WCS-backed annotations" }),
    ).not.toBeInTheDocument();
  });

  it("rejects a pagination page whose immutable WCS identity changes", async () => {
    fake.create.mockResolvedValue({
      data: {
        job_id: null,
        remote_processing: true,
        retention_hours: 24,
        solver_type: "nova",
        status: "submitting",
        submission_id: submissionId,
      },
      kind: "ok",
      status: 202,
    });
    fake.request.mockResolvedValue({
      data: {
        completed_at: "2026-09-16T12:00:01Z",
        created_at: "2026-09-16T12:00:00Z",
        deleted_at: null,
        error_code: null,
        job_id: null,
        progress: null,
        remote_processing: true,
        result: null,
        retention_hours: 24,
        solution_available: true,
        solver_type: "nova",
        status: "succeeded",
        submission_id: submissionId,
      },
      kind: "ok",
      status: 200,
    });
    fake.solution
      .mockResolvedValueOnce({
        data: {
          ...remoteSolutionBase,
          annotations: [
            {
              category: "star",
              dec_deg: -8.2016,
              names: ["Rigel"],
              pixel_x: 24,
              pixel_y: 30,
              ra_deg: 78.6345,
            },
          ],
          has_more: true,
          next_cursor: "fixture_cursor_1",
        },
        kind: "ok",
        status: 200,
      })
      .mockResolvedValueOnce({
        data: {
          ...remoteSolutionBase,
          annotations: [
            {
              category: "deep_sky",
              dec_deg: -5.3911,
              names: ["Orion Nebula"],
              pixel_x: 68,
              pixel_y: 52,
              ra_deg: 83.8221,
            },
          ],
          calibration: { ...remoteSolutionBase.calibration, center_ra_deg: 83.5 },
          has_more: false,
          next_cursor: null,
        },
        kind: "ok",
        status: 200,
      });
    const user = userEvent.setup();
    render(<IdentifyView apiOrigin="http://127.0.0.1:8000" capabilities={remoteCapabilities} />);

    await user.upload(
      screen.getByLabelText("JPEG or PNG image"),
      new File(["private"], "night.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Start remote plate solve" }));
    await waitFor(() => expect(fake.solution).toHaveBeenCalledOnce(), { timeout: 2_500 });

    await user.click(screen.getByRole("button", { name: "Load more annotations" }));
    await waitFor(() => expect(fake.solution).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alert")).toHaveTextContent(/temporarily unavailable/i);
    expect(screen.getAllByText("Rigel").length).toBeGreaterThan(0);
    expect(screen.queryByText("Orion Nebula")).not.toBeInTheDocument();
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
        solution_available: false,
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
