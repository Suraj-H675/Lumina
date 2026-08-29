import { afterEach, describe, expect, it, vi } from "vitest";

import { liveEndpoint, metaEndpoint } from "../src/contract";
import { MAX_RESPONSE_BYTES, normalizeApiOrigin, requestEndpoint } from "../src/transport";

function jsonResponse(body: unknown, contentType = "application/json"): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": contentType },
    status: 200,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("API origin normalization", () => {
  it.each([
    ["http://127.0.0.1:8000", "http://127.0.0.1:8000"],
    ["https://api.example.test/", "https://api.example.test"],
    ["HTTPS://API.EXAMPLE.TEST", "https://api.example.test"],
    ["http://example.test:8080/", "http://example.test:8080"],
    ["http://[::1]:8000", "http://[::1]:8000"],
    ["https://[2001:db8::1]/", "https://[2001:db8::1]"],
  ])("normalizes %s", (value, expected) => {
    expect(normalizeApiOrigin(value)).toEqual({ origin: expected, valid: true });
  });

  it.each([
    "",
    " http://127.0.0.1:8000",
    "ftp://api.example.test",
    "https://user:password@api.example.test", // trufflehog:ignore
    "https://api.example.test/path",
    "https://api.example.test?query=yes",
    "https://api.example.test#fragment",
    "https://api.example.test/a/..",
    "https://api.example.test/%2e",
    "https://api.example.test/%2E",
    "https://api.example.test/%2e%2e/",
    "https://api.example.test/./",
    "https://api.example.test//",
    "https://api.example.test/%2e./",
    "https://api.example.test/.%2E/",
    "https://api.example.test\\path",
    "https://api.example.test\\a\\..",
    "https://api.example.test/path?query=yes",
    "https://[2001:db8::1]/a/..",
    "not a URL",
  ])("rejects unsafe or ambiguous value %s", (value) => {
    expect(normalizeApiOrigin(value)).toEqual({ valid: false });
  });
});

describe("bounded native-fetch transport", () => {
  it("uses the generated GET path and requests uncached JSON", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ status: "live" }));

    await expect(
      requestEndpoint("http://127.0.0.1:8000", liveEndpoint, { fetchImplementation }),
    ).resolves.toEqual({ data: { status: "live" }, kind: "ok", status: 200 });
    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [url, options] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toEqual(new URL("http://127.0.0.1:8000/health/live"));
    expect(options).toMatchObject({
      cache: "no-store",
      headers: { Accept: "application/json" },
      method: "GET",
      redirect: "error",
    });
  });

  it.each([null, "text/plain"])("rejects the 2xx media type %s before parsing", async (type) => {
    const response = new Response(
      '{"status":"live"}',
      type === null ? { status: 200 } : { headers: { "Content-Type": type }, status: 200 },
    );
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(response);

    await expect(
      requestEndpoint("http://127.0.0.1:8000", liveEndpoint, { fetchImplementation }),
    ).resolves.toEqual({ kind: "malformed-response" });
  });

  it.each(["application/json; charset=utf-8", "Application/JSON; Charset=UTF-8"])(
    "accepts JSON media type parameters and case-insensitive matching: %s",
    async (type) => {
      const fetchImplementation = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ status: "live" }, type));
      await expect(
        requestEndpoint("http://127.0.0.1:8000", liveEndpoint, { fetchImplementation }),
      ).resolves.toMatchObject({ kind: "ok" });
    },
  );

  it("leaves a non-2xx response body unread and returns only its status", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(stream, { status: 503 }));

    await expect(
      requestEndpoint("http://127.0.0.1:8000", liveEndpoint, { fetchImplementation }),
    ).resolves.toEqual({ kind: "http-error", status: 503 });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects an excessive declared content length and cancels the body", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const response = new Response(stream, {
      headers: {
        "Content-Length": String(MAX_RESPONSE_BYTES + 1),
        "Content-Type": "application/json",
      },
      status: 200,
    });

    await expect(
      requestEndpoint("http://127.0.0.1:8000", liveEndpoint, {
        fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(response),
      }),
    ).resolves.toEqual({ kind: "malformed-response" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("enforces the byte bound when content length is absent", async () => {
    const cancel = vi.fn();
    const chunk = new Uint8Array(40_000);
    const stream = new ReadableStream<Uint8Array>({
      cancel,
      pull(controller) {
        controller.enqueue(chunk);
      },
    });
    const response = new Response(stream, {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

    await expect(
      requestEndpoint("http://127.0.0.1:8000", liveEndpoint, {
        fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(response),
      }),
    ).resolves.toEqual({ kind: "malformed-response" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("classifies abort-driven timeouts without exposing a thrown error", async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("private timeout detail", "AbortError"));
          });
        }),
    );
    const result = requestEndpoint("http://127.0.0.1:8000", liveEndpoint, {
      fetchImplementation,
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);
    await expect(result).resolves.toEqual({ kind: "unavailable", reason: "timeout" });
  });

  it("propagates an external abort signal to the bounded fetch", async () => {
    const external = new AbortController();
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new DOMException("aborted", "AbortError"));
            return;
          }
          init?.signal?.addEventListener(
            "abort",
            () => {
              reject(new DOMException("aborted", "AbortError"));
            },
            { once: true },
          );
        }),
    );

    const result = requestEndpoint("http://127.0.0.1:8000", liveEndpoint, {
      fetchImplementation,
      signal: external.signal,
    });
    external.abort();

    await expect(result).resolves.toEqual({ kind: "unavailable", reason: "transport" });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("classifies transport failure without leaking errors or origins", async () => {
    const origin = "http://private-internal.example.test:8123";
    const sentinel = "PRIVATE-DIAGNOSTIC-SENTINEL";
    const result = await requestEndpoint(origin, liveEndpoint, {
      fetchImplementation: vi.fn<typeof fetch>().mockRejectedValue(new Error(sentinel)),
    });

    expect(result).toEqual({ kind: "unavailable", reason: "transport" });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(JSON.stringify(result)).not.toContain(origin);
  });

  it("rejects malformed and additive response data at runtime", async () => {
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ status: 42 }));
    const additive = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ status: "live", unexpected: true }));
    const nestedAdditive = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        api_version: "v1",
        application_name: "Lumina",
        application_version: "0.0.0",
        build_commit: null,
        feature_flags: {},
        unexpected: true,
      }),
    );

    await expect(
      requestEndpoint("http://127.0.0.1:8000", liveEndpoint, {
        fetchImplementation: malformed,
      }),
    ).resolves.toEqual({ kind: "malformed-response" });
    await expect(
      requestEndpoint("http://127.0.0.1:8000", liveEndpoint, { fetchImplementation: additive }),
    ).resolves.toEqual({ kind: "malformed-response" });
    await expect(
      requestEndpoint("http://127.0.0.1:8000", metaEndpoint, {
        fetchImplementation: nestedAdditive,
      }),
    ).resolves.toEqual({ kind: "malformed-response" });
  });
});
