import { NextResponse, type NextRequest } from "next/server";

import { decodeScaleExplorerState } from "./lib/simulations/scale-explorer";

/**
 * Map shareable query state to a pre-rendered node route so the first response keeps its selected
 * result even with JavaScript disabled. The browser URL remains the compact query-state URL.
 */
export function proxy(request: NextRequest) {
  const values = request.nextUrl.searchParams.getAll("state");
  if (values.length === 0) return NextResponse.next();

  const decoded = values.length === 1 ? decodeScaleExplorerState(values[0]) : null;
  const destination = request.nextUrl.clone();
  destination.pathname =
    decoded === null
      ? "/lab/scale-explorer/invalid-state"
      : `/lab/scale-explorer/${decoded.node_id}`;
  destination.search = "";
  return decoded === null ? NextResponse.redirect(destination) : NextResponse.rewrite(destination);
}

export const config = {
  matcher: ["/lab/scale-explorer"],
};
