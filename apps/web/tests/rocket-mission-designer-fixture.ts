import { zRocketMissionDesignerCalculationResponse } from "@nova-lumina/api-client/generated/zod";

import fixtures from "../../../packages/api-client/tests/fixtures/rocket-mission-designer.json";

export const ROCKET_MISSION_DESIGNER_DEFAULT_RESULT =
  zRocketMissionDesignerCalculationResponse.parse(fixtures.default_vehicle);

export const ROCKET_MISSION_DESIGNER_PAYLOAD_6000_RESULT =
  zRocketMissionDesignerCalculationResponse.parse(fixtures.accepted_payload_6000);
