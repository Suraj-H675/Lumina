import { ScaleExplorerNoScript } from "../../../../components/scale-explorer-no-script";
import { DEFAULT_SCALE_EXPLORER_STATE } from "../../../../lib/simulations/scale-explorer";

/**
 * Keep the malformed-state response useful before the static page stream is revealed. This
 * route-local fallback is also the no-JavaScript response when the client enhancement cannot run.
 */
export default function InvalidScaleExplorerLoading() {
  return (
    <ScaleExplorerNoScript initialState={DEFAULT_SCALE_EXPLORER_STATE} initialStateInvalid={true} />
  );
}
