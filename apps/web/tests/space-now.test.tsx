import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ApodResponse } from "@lumina/api-client";

vi.mock("server-only", () => ({}));

import { SpaceNowView } from "../src/app/now/space-now-view";
import { SiteShell } from "../src/components/site-shell";
import { loadNowApod } from "../src/lib/server/space-now";

const source = {
  name: "NASA Astronomy Picture of the Day (APOD)",
  official_url: "https://apod.nasa.gov/apod/",
  api_documentation_url: "https://api.nasa.gov/",
  media_usage_url: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
  attribution_text: "NASA Astronomy Picture of the Day (APOD), provided through NASA's Open APIs.",
};

const freshness = {
  cache_state: "fresh" as const,
  retrieved_at: "2026-09-10T12:00:00Z",
  fresh_until: "2026-09-10T18:00:00Z",
  stale_until: "2026-09-13T18:00:00Z",
  last_refresh_failure_code: null,
};

const imageResponse: ApodResponse = {
  availability: "fresh",
  unavailable_reason: null,
  content: {
    date: "2026-09-09",
    title: "<script>alert('fixture')</script>",
    explanation: "NASA explanation text remains plain text: <strong>not markup</strong>.",
    media_type: "image",
    copyright: "Fixture Creator <img src=x>",
    service_version: "v1",
    apod_page_url: "https://apod.nasa.gov/apod/ap260909.html",
  },
  freshness,
  source,
};

const videoResponse: ApodResponse = {
  ...imageResponse,
  content: {
    ...imageResponse.content!,
    title: "Fixture video APOD",
    explanation: "NASA's video explanation.",
    media_type: "video",
    copyright: null,
  },
};

function renderPage(response: ApodResponse) {
  return render(
    <SiteShell>
      <SpaceNowView outcome={{ data: response, kind: "ok" }} />
    </SiteShell>,
  );
}

describe("Space Now Daily Visual", () => {
  it("renders image records as safe text with a fixed official page CTA", () => {
    const { container } = renderPage(imageResponse);

    expect(screen.getByRole("heading", { level: 1, name: "Space Now" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: /script>alert/ })).toBeVisible();
    expect(screen.getByText("APOD content date")).toBeVisible();
    expect(screen.getByText("2026-09-09")).toBeVisible();
    expect(screen.getByText("Image")).toBeVisible();
    expect(screen.getByText(/NASA explanation text remains plain text/)).toBeVisible();
    expect(screen.getByText("Fixture Creator <img src=x>")).toBeVisible();

    const action = screen.getByRole("link", { name: "View today's APOD image" });
    expect(action).toHaveAttribute("href", "https://apod.nasa.gov/apod/ap260909.html");
    expect(action).toHaveAttribute("target", "_blank");
    expect(action).toHaveAttribute("rel", "noopener noreferrer");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("api.nasa.gov/planetary/apod");
  });

  it("renders video records as a link-only state without an embed or thumbnail", () => {
    const { container } = renderPage(videoResponse);

    expect(screen.getByText("Video")).toBeVisible();
    expect(screen.getByRole("link", { name: "Watch today's APOD video" })).toHaveAttribute(
      "href",
      "https://apod.nasa.gov/apod/ap260909.html",
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.queryByText(/Copyright \/ credit:/)).not.toBeInTheDocument();
  });

  it("makes stale state explicit and keeps retrieval facts separate from content date", () => {
    renderPage({
      ...imageResponse,
      availability: "stale",
      freshness: {
        ...freshness,
        cache_state: "stale",
        last_refresh_failure_code: "provider.timeout",
      },
    });

    expect(screen.getByRole("status")).toHaveTextContent("Stale Daily Visual snapshot");
    expect(screen.getByText("APOD content date")).toBeVisible();
    expect(screen.getByText("Retrieved at (UTC)")).toBeVisible();
    expect(screen.getByText("2026-09-10T12:00:00Z")).toBeVisible();
    expect(screen.getByText("provider.timeout")).toBeVisible();
  });

  it("renders unavailable states without presenting cached content as active", () => {
    const response: ApodResponse = {
      ...imageResponse,
      availability: "unavailable",
      unavailable_reason: "provider_disabled",
      content: null,
      freshness: { ...freshness, cache_state: "fresh" },
    };
    renderPage(response);

    expect(
      screen.getByRole("heading", { level: 2, name: "Daily Visual is currently unavailable." }),
    ).toBeVisible();
    expect(screen.getByText("The Daily Visual provider is disabled.")).toBeVisible();
    expect(screen.queryByText("Fixture Creator <img src=x>")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /APOD image|APOD video/i })).not.toBeInTheDocument();
  });

  it.each([
    ["fresh", imageResponse],
    [
      "stale",
      {
        ...imageResponse,
        availability: "stale" as const,
        freshness: { ...freshness, cache_state: "stale" as const },
      },
    ],
    [
      "unavailable",
      {
        ...imageResponse,
        availability: "unavailable" as const,
        unavailable_reason: "cached_content_expired" as const,
        content: null,
        freshness: { ...freshness, cache_state: "expired" as const },
      },
    ],
  ])("passes axe for the %s state", async (_name, response) => {
    const { container } = renderPage(response as ApodResponse);
    expect((await axe(container)).violations).toHaveLength(0);
  });
});

describe("server-rendered APOD loader", () => {
  it("requests only Lumina's public APOD projection without query parameters", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const response = new Response(JSON.stringify(imageResponse), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((input, init) => {
      requests.push({ url: String(input), init });
      return Promise.resolve(response.clone());
    });

    const outcome = await loadNowApod({
      environment: "production",
      fetchImplementation,
      origin: "https://lumina-api.example.test",
    });

    expect(outcome).toEqual({ data: imageResponse, kind: "ok" });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("https://lumina-api.example.test/api/v1/now/apod");
    expect(requests[0]!.url).not.toContain("api_key");
    expect(requests[0]!.url).not.toContain("date=");
  });

  it("fails closed without a production API origin and on malformed API data", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();

    await expect(loadNowApod({ environment: "production", fetchImplementation })).resolves.toEqual({
      kind: "unavailable",
    });
    expect(fetchImplementation).not.toHaveBeenCalled();

    fetchImplementation.mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    await expect(
      loadNowApod({
        environment: "production",
        fetchImplementation,
        origin: "https://lumina-api.example.test",
      }),
    ).resolves.toEqual({ kind: "unavailable" });
  });
});
