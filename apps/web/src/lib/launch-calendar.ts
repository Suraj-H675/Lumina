import type { LaunchItemResponse } from "@lumina/api-client";

function icalEscape(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

function compactUtc(value: string): string | null {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value.replace("Z", ".000Z")) {
    const canonical = parsed.toISOString();
    if (!Number.isFinite(parsed.getTime()) || !canonical.startsWith(value.slice(0, 19)))
      return null;
  }
  return parsed
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z");
}

function foldLine(line: string): string[] {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return [line];
  const segments: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    const limit = segments.length === 0 ? 75 : 74;
    if (current !== "" && currentBytes + bytes > limit) {
      segments.push(segments.length === 0 ? current : ` ${current}`);
      current = character;
      currentBytes = bytes;
    } else {
      current += character;
      currentBytes += bytes;
    }
  }
  if (current !== "") segments.push(segments.length === 0 ? current : ` ${current}`);
  return segments;
}

export function launchCalendarFilename(launch: LaunchItemResponse): string {
  const safe = launch.slug.replace(/[^a-z0-9-]/gu, "").slice(0, 80) || "launch";
  return `${safe}.ics`;
}

export function buildLaunchCalendar(launch: LaunchItemResponse): string | null {
  if (!launch.timing.calendar_eligible) return null;
  const dtStart = compactUtc(launch.timing.net_utc);
  const dtStamp = compactUtc(launch.timing.provider_updated_at);
  if (dtStart === null || dtStamp === null) return null;
  const dtEnd =
    launch.timing.window_end_utc === null ? null : compactUtc(launch.timing.window_end_utc);
  const confirmed = launch.status.abbreviation === "Go" && launch.timing.countdown_eligible;
  const description = [
    `Status: ${launch.status.name}`,
    `Schedule precision: ${launch.timing.precision_name}`,
    launch.site === null ? null : `Launch site: ${launch.site.pad_name}`,
    launch.agency === null ? null : `Launch provider: ${launch.agency.name}`,
  ]
    .filter((value): value is string => value !== null)
    .join("\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lumina//Launch Center//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${icalEscape(`launch-library-2-${launch.launch_id}@lumina.local`)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    ...(dtEnd === null || dtEnd === dtStart ? [] : [`DTEND:${dtEnd}`]),
    `STATUS:${confirmed ? "CONFIRMED" : "TENTATIVE"}`,
    `SUMMARY:${icalEscape(launch.name)}`,
    `DESCRIPTION:${icalEscape(description)}`,
    ...(launch.official_page_url === null ? [] : [`URL:${icalEscape(launch.official_page_url)}`]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.flatMap(foldLine).join("\r\n")}\r\n`;
}
