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

import { CompareAddObject } from "../src/components/compare-add-object";

const COMBOBOX = { name: /add an object to compare/i };

function jsonOk(body: unknown): { json: () => Promise<unknown>; ok: boolean; status: number } {
  return { json: () => Promise.resolve(body), ok: true, status: 200 };
}

function okSuggestions(items: Array<{ canonical_name: string; slug: string }>) {
  return {
    items: items.map((item) => ({ ...item, entity_type: "star", id: item.slug })),
  };
}

afterEach(() => {
  fetchMock.mockReset();
  pushMock.mockReset();
});

describe("CompareAddObject keyboard and maximum behaviour", () => {
  it("adds the highlighted suggestion with ArrowDown + Enter", async () => {
    fetchMock.mockResolvedValue(
      jsonOk(okSuggestions([{ canonical_name: "K2-18", slug: "k2-18" }])),
    );
    render(<CompareAddObject apiOrigin="http://127.0.0.1:8765" selectedSlugs={["kepler-452"]} />);

    const user = userEvent.setup();
    const input = screen.getByRole("combobox", COMBOBOX);
    await user.type(input, "18");
    await screen.findByRole("option", { name: /K2-18/ });

    await user.type(input, "{ArrowDown}");
    expect(screen.getByRole("option", { name: /K2-18/ })).toHaveAttribute("aria-selected", "true");

    await user.type(input, "{Enter}");
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/compare?object=kepler-452&object=k2-18");
    });
  });

  it("closes the listbox on Escape without committing", async () => {
    fetchMock.mockResolvedValue(
      jsonOk(okSuggestions([{ canonical_name: "K2-18", slug: "k2-18" }])),
    );
    render(<CompareAddObject apiOrigin="http://127.0.0.1:8765" selectedSlugs={[]} />);

    const user = userEvent.setup();
    const input = screen.getByRole("combobox", COMBOBOX);
    await user.type(input, "18");
    await screen.findByRole("option", { name: /K2-18/ });

    await user.type(input, "{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("disables adding at the three-object maximum", async () => {
    fetchMock.mockResolvedValue(
      jsonOk(okSuggestions([{ canonical_name: "HD 209458", slug: "hd-209458" }])),
    );
    render(
      <CompareAddObject
        apiOrigin="http://127.0.0.1:8765"
        selectedSlugs={["k2-18", "kepler-452", "51-pegasi"]}
      />,
    );

    const input = screen.getByRole("combobox", COMBOBOX);
    expect(input).toBeDisabled();
    expect(screen.getByText(/comparison is at the maximum of three objects/i)).toBeInTheDocument();

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    // A disabled input cannot type or request; no fourth object can enter.
    await user.click(input);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
