import { readFile, stat } from "node:fs/promises";

import { expect, type TestInfo } from "@playwright/test";

type StubMode = "disconnect" | "ready";

type Coordination = Readonly<{
  apiOrigin: string;
  token: string;
}>;

async function coordinationFromFile(path: unknown): Promise<Coordination> {
  if (typeof path !== "string") {
    throw new Error("Status stub coordination is unavailable.");
  }
  const resolvedPath = path;
  const details = await stat(resolvedPath);
  expect(details.mode & 0o077).toBe(0);
  return JSON.parse(await readFile(resolvedPath, "utf8")) as Coordination;
}

async function coordination(testInfo: TestInfo): Promise<Coordination> {
  return coordinationFromFile(testInfo.config.metadata.luminaE2eCoordinationFile);
}

export async function setStatusStubMode(testInfo: TestInfo, mode: StubMode): Promise<void> {
  const control = await coordination(testInfo);
  const response = await fetch(`${control.apiOrigin}/__control/mode`, {
    body: JSON.stringify({ mode }),
    headers: {
      Authorization: `Bearer ${control.token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  expect(response.status).toBe(200);
  await response.body?.cancel();
}

export async function assertStatusStubClean(testInfo: TestInfo): Promise<void> {
  await assertStatusStubCleanFromFile(testInfo.config.metadata.luminaE2eCoordinationFile);
}

export async function assertStatusStubCleanFromFile(coordinationFile: unknown): Promise<void> {
  const control = await coordinationFromFile(coordinationFile);
  const response = await fetch(`${control.apiOrigin}/__control/assert-clean`, {
    headers: { Authorization: `Bearer ${control.token}` },
    method: "POST",
  });
  await response.body?.cancel();
  if (response.status !== 200) {
    throw new Error("Status stub recorded process-owned request violations.");
  }
}

export async function clearStatusStubViolations(testInfo: TestInfo): Promise<void> {
  const control = await coordination(testInfo);
  const response = await fetch(`${control.apiOrigin}/__control/clear-violations`, {
    headers: { Authorization: `Bearer ${control.token}` },
    method: "POST",
  });
  expect(response.status).toBe(200);
  await response.body?.cancel();
}

export async function generateUnexpectedStatusStubTraffic(testInfo: TestInfo): Promise<void> {
  const control = await coordination(testInfo);
  const requests = [
    fetch(`${control.apiOrigin}/unexpected`),
    fetch(`${control.apiOrigin}/health/live`, { method: "POST" }),
    fetch(`${control.apiOrigin}/health/live?unexpected=true`),
    fetch(`${control.apiOrigin}/__control/mode`, { method: "POST" }),
    fetch(`${control.apiOrigin}/__control/mode`, {
      body: "not-json",
      headers: {
        Authorization: `Bearer ${control.token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  ];
  const expectedStatuses = [500, 500, 500, 403, 400];
  for (const [index, request] of requests.entries()) {
    const response = await request;
    expect(response.status).toBe(expectedStatuses[index]);
    await response.body?.cancel();
  }
}
