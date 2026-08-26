import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchMock, pushMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.stubGlobal("fetch", fetchMock);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { CatalogueSearchBox } from "../src/components/catalogue-search-box";

function jsonOk(body: unknown): { json: () => Promise<unknown>; ok: boolean; status: number } {
  return { json: () => Promise.resolve(body), ok: true, status: 200 };
}

type SuggestBody = Readonly<{
  items: Array<{ canonical_name: string; entity_type: string; id: string; slug: string }>;
}>;

function okSuggestions(items: Array<{ canonical_name: string; slug: string }>): SuggestBody {
  return {
    items: items.map((item) => ({ ...item, entity_type: "star", id: item.slug })),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Debounce window used by the component; keep the wait just above it. */
const DEBOUNCE_MS = 200;
const COMBOBOX = { name: /search the catalogue/i };

async function typeQuery(query: string): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByRole("combobox", COMBOBOX), query);
}

afterEach(() => {
  fetchMock.mockReset();
  pushMock.mockReset();
});

describe("CatalogueSearchBox", () => {
  it("debounces suggestions and discards stale responses so only the newest wins", async () => {
    const resolvers: Array<(body: SuggestBody) => void> = [];
    fetchMock.mockImplementation(
      () =>
        new Promise<{ json: () => Promise<SuggestBody>; ok: boolean }>((resolve) => {
          resolvers.push((body) => resolve({ json: () => Promise.resolve(body), ok: true }));
        }),
    );

    render(<CatalogueSearchBox apiOrigin="http://127.0.0.1:8765" initialQuery="" />);
    const input = screen.getByRole("combobox", COMBOBOX);
    const user = userEvent.setup();

    await user.type(input, "ke");
    // Debounce has not elapsed yet: nothing requested.
    expect(fetchMock).not.toHaveBeenCalled();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v1/search/suggest?q=ke");

    // A further keystroke supersedes the pending request before it resolves.
    await user.type(input, "p");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    resolvers[1]?.(okSuggestions([{ canonical_name: "Kepler-186", slug: "kepler-186" }]));
    const option = await screen.findByRole("option", { name: /Kepler-186/ });
    expect(option).toBeVisible();

    // The older request finally resolving must NOT repaint the suggestions.
    resolvers[0]?.(okSuggestions([{ canonical_name: "HD 209458", slug: "hd-209458" }]));
    await sleep(DEBOUNCE_MS);
    expect(screen.getByRole("option", { name: /Kepler-186/ })).toBeVisible();
    expect(screen.queryByRole("option", { name: /HD 209458/ })).not.toBeInTheDocument();
  });

  it("does not request suggestions below the public minimum query length", async () => {
    fetchMock.mockResolvedValue(jsonOk(okSuggestions([])));
    render(<CatalogueSearchBox apiOrigin="http://127.0.0.1:8765" initialQuery="" />);

    await typeQuery("k");
    await sleep(DEBOUNCE_MS);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports keyboard navigation, escape, and enter-to-search without a selection", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonOk(
          okSuggestions([
            { canonical_name: "K2-18", slug: "k2-18" },
            { canonical_name: "Kepler-186", slug: "kepler-186" },
          ]),
        ),
      )
      .mockResolvedValue(jsonOk(okSuggestions([])));

    render(<CatalogueSearchBox apiOrigin="http://127.0.0.1:8765" initialQuery="k2" />);
    const input = screen.getByRole("combobox", COMBOBOX);
    const user = userEvent.setup();

    await user.type(input, "1");
    await screen.findByRole("option", { name: /K2-18/ });
    expect(input.getAttribute("aria-expanded")).toBe("true");

    await user.type(input, "{ArrowDown}");
    expect(screen.getByRole("option", { name: /K2-18/ })).toHaveAttribute("aria-selected", "true");
    expect(input.getAttribute("aria-activedescendant")).toContain("k2-18");

    await user.type(input, "{ArrowDown}");
    expect(screen.getByRole("option", { name: /Kepler-186/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.type(input, "{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("option", { name: /K2-18/ })).toHaveAttribute("aria-selected", "true");

    await user.type(input, "{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input.getAttribute("aria-expanded")).toBe("false");

    // Enter with no active suggestion commits the full search URL.
    await user.type(input, "{Enter}");
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/explore?q=k21");
    });
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("navigates to the object page when a suggestion is chosen with the keyboard or mouse", async () => {
    fetchMock.mockResolvedValue(
      jsonOk(okSuggestions([{ canonical_name: "K2-18", slug: "k2-18" }])),
    );

    render(<CatalogueSearchBox apiOrigin="http://127.0.0.1:8765" initialQuery="" />);
    const input = screen.getByRole("combobox", COMBOBOX);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.type(input, "18");
    await screen.findByRole("option", { name: /K2-18/ });
    expect(screen.getByRole("option", { name: /K2-18/ })).toHaveAttribute("aria-selected", "false");

    await user.type(input, "{ArrowDown}");
    await user.type(input, "{Enter}");
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/objects/k2-18");
    });

    // Mouse selection navigates too.
    await user.clear(input);
    await user.type(input, "18");
    await screen.findByRole("option", { name: /K2-18/ });
    await user.click(screen.getByRole("option", { name: /K2-18/ }));
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledTimes(2);
    });
  });

  it("keeps a working native GET form when client navigation is unavailable", () => {
    render(<CatalogueSearchBox apiOrigin="http://127.0.0.1:8765" initialQuery="k2" />);

    const form = document.querySelector("form");
    expect(form?.getAttribute("action")).toBe("/explore");
    expect(form?.getAttribute("method")).toBe("get");
    const queryField = form?.querySelector('input[name="q"]');
    expect(queryField).not.toBeNull();
    expect((queryField as HTMLInputElement | null)?.value).toBe("k2");
  });

  it("announces suggestion availability politely for assistive technology", async () => {
    fetchMock.mockResolvedValue(
      jsonOk(okSuggestions([{ canonical_name: "K2-18", slug: "k2-18" }])),
    );
    render(<CatalogueSearchBox apiOrigin="http://127.0.0.1:8765" initialQuery="" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    await typeQuery("18");
    await screen.findByRole("option", { name: /K2-18/ });
    expect(screen.getByRole("status").textContent).toMatch(/1 suggestion available/);
  });
});
