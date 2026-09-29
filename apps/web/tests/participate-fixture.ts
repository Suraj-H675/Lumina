import type { ParticipateResponse } from "@nova-lumina/api-client";
import { zParticipateResponse } from "@nova-lumina/api-client/generated/zod";

import participateFixture from "../../../packages/api-client/tests/fixtures/participate-response.json";

export const PARTICIPATE_FRESH_RESPONSE: ParticipateResponse =
  zParticipateResponse.parse(participateFixture);
