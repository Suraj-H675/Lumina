import { buildLaunchCalendar, launchCalendarFilename } from "../../../../../lib/launch-calendar";
import { loadNowLaunch } from "../../../../../lib/server/space-now";

type CalendarRouteProps = Readonly<{
  params: Promise<Readonly<{ launchId: string }>>;
}>;

export async function GET(_: Request, { params }: CalendarRouteProps): Promise<Response> {
  const { launchId } = await params;
  const outcome = await loadNowLaunch(launchId);
  if (outcome.kind === "not-found") return new Response("Not found\n", { status: 404 });
  if (
    outcome.kind !== "ok" ||
    outcome.data.launch === null ||
    outcome.data.availability === "unavailable"
  ) {
    return new Response("Launch data unavailable\n", { status: 503 });
  }
  const calendar = buildLaunchCalendar(outcome.data.launch);
  if (calendar === null) {
    return new Response("Calendar export is unavailable for this schedule precision.\n", {
      status: 409,
    });
  }
  return new Response(calendar, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${launchCalendarFilename(outcome.data.launch)}"`,
      "Content-Type": "text/calendar; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
    status: 200,
  });
}
