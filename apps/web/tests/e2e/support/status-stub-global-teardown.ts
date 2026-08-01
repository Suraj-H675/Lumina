import type { FullConfig } from "@playwright/test";

import { assertStatusStubCleanFromFile } from "./status-stub-control";

export default async function assertCleanStatusStub(config: FullConfig): Promise<void> {
  await assertStatusStubCleanFromFile(config.metadata.luminaE2eCoordinationFile);
}
