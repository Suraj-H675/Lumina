import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PwaStatus } from "../src/components/pwa-status";

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

function setServiceWorker(value: unknown): void {
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value,
  });
}

function setCacheStorage(value: unknown): void {
  Object.defineProperty(window, "caches", {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  setOnline(true);
  setServiceWorker(undefined);
  Object.defineProperty(window, "caches", {
    configurable: true,
    value: undefined,
  });
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Lumina PWA connectivity and update status", () => {
  it("announces lost connectivity without relabelling displayed provider data as current", () => {
    render(<PwaStatus />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByRole("status")).toHaveTextContent(/you are offline/i);
    expect(screen.getByRole("status")).toHaveTextContent(
      /displayed live or provider data may no longer be current/i,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/check its source and retrieval time/i);
  });

  it("labels an approved cached page with the recorded Lumina cache time", async () => {
    setOnline(false);
    window.history.replaceState({}, "", "/learn/your-first-night-sky");
    const cachedAt = "2026-09-19T09:15:00.000Z";
    const match = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ cachedAt }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    setCacheStorage({ open: vi.fn().mockResolvedValue({ match }) });

    const { container } = render(<PwaStatus />);

    expect(await screen.findByText(/this page is an offline copy saved by lumina/i)).toBeVisible();
    expect(container.querySelector("time")).toHaveAttribute("datetime", cachedAt);
  });

  it("trusts a service-worker network failure over navigator.onLine's optimistic hint", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setOnline(true);
    const connectivityCheckedAt = "2026-09-19T09:16:00.000Z";
    const match = vi.fn().mockImplementation(async (request: RequestInfo | URL) => {
      if (String(request).includes("__lumina_pwa_connectivity__")) {
        return new Response(
          JSON.stringify({ checkedAt: connectivityCheckedAt, networkAvailable: false }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      return undefined;
    });
    setCacheStorage({ open: vi.fn().mockResolvedValue({ match }) });
    const registration = {
      addEventListener: vi.fn(),
      installing: null,
      removeEventListener: vi.fn(),
      waiting: null,
    };
    setServiceWorker({
      addEventListener: vi.fn(),
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
      removeEventListener: vi.fn(),
    });

    render(<PwaStatus />);

    expect(await screen.findByRole("status")).toHaveTextContent(/you are offline/i);
    expect(screen.getByRole("status")).toHaveTextContent(/may no longer be current/i);
  });

  it("registers only the accepted root worker contract in production and exposes a waiting update", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const postMessage = vi.fn();
    const waitingWorker = { postMessage };
    const registrationListeners = new Map<string, EventListener>();
    const registration = {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        registrationListeners.set(type, listener);
      }),
      installing: null,
      removeEventListener: vi.fn(),
      waiting: waitingWorker,
    };
    const containerListeners = new Map<string, EventListener>();
    const serviceWorker = {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        containerListeners.set(type, listener);
      }),
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
      removeEventListener: vi.fn(),
    };
    setServiceWorker(serviceWorker);
    const user = userEvent.setup();

    render(<PwaStatus />);

    await waitFor(() => {
      expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
    });
    expect(await screen.findByText(/a lumina update is ready/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Apply update" }));
    expect(postMessage).toHaveBeenCalledWith({ type: "LUMINA_ACTIVATE_UPDATE" });
    expect(screen.getByRole("button", { name: "Applying update…" })).toBeDisabled();
  });

  it("does not register a service worker in test/development mode", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const register = vi.fn();
    setServiceWorker({ addEventListener: vi.fn(), controller: null, register });

    render(<PwaStatus />);
    await Promise.resolve();

    expect(register).not.toHaveBeenCalled();
  });
});
