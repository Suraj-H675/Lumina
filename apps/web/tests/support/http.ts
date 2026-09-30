export function jsonOk(body: unknown): {
  json: () => Promise<unknown>;
  ok: boolean;
  status: number;
} {
  return { json: () => Promise.resolve(body), ok: true, status: 200 };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

export function arrayBufferResponse(bytes: Uint8Array): Response {
  return {
    ok: true,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  } as Response;
}

export function fetchRecording(handler: (path: string) => Response | undefined): {
  implementation: typeof fetch;
  requests: Array<string>;
} {
  const requests: Array<string> = [];
  const implementation = ((input: RequestInfo | URL) => {
    const url = input instanceof URL ? input : new URL(String(input));
    const path = `${url.pathname}${url.search}`;
    requests.push(path);
    return Promise.resolve(handler(path) ?? new Response("{}", { status: 500 }));
  }) as unknown as typeof fetch;
  return { implementation, requests };
}
