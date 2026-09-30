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
