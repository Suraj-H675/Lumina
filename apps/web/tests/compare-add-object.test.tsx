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
    items: items.map((item) => ({
      ...item,
      entity_type: "star",
      id: "12345678-1234-4234-9234-123456789abc",
    })),
  };
}

afterEach(() => {
  fetchMock.mockReset();
  pushMock.mockReset();
});

describe("CompareAddObject", () => {
  it("appends the chosen suggestion to the committed object parameters", async () => {
    fetchMock.mockResolvedValue(
      jsonOk(okSuggestions([{ canonical_name: "Kepler-452", slug: "kepler-452" }])),
    );
    render(<CompareAddObject apiOrigin="http://127.0.0.1:8765" selectedSlugs={["k2-18"]} />);

    const user = userEvent.setup();
    const input = screen.getByRole("combobox", COMBOBOX);
    await user.type(input, "452");

    const option = await screen.findByRole("option", { name: /Kepler-452/ });
    await user.click(option);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/compare?object=k2-18&object=kepler-452");
    });
  });

  it("never offers an already-selected slug and never accepts it", async () => {
    fetchMock.mockResolvedValue(
      jsonOk(
        okSuggestions([
          { canonical_name: "K2-18", slug: "k2-18" },
          { canonical_name: "Kepler-186", slug: "kepler-186" },
        ]),
      ),
    );
    render(<CompareAddObject apiOrigin="http://127.0.0.1:8765" selectedSlugs={["k2-18"]} />);

    const user = userEvent.setup();
    await user.type(screen.getByRole("combobox", COMBOBOX), "18");

    await screen.findByRole("option", { name: /Kepler-186/ });
    expect(screen.queryByRole("option", { name: /^K2-18/ })).not.toBeInTheDocument();
  });
});
