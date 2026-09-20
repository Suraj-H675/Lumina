"use client";

import { useEffect, useMemo, useState } from "react";

import { formatLocaleNumber, formatMessageTemplate } from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { LaunchCenterMessages } from "../../../lib/i18n/messages/types";

type LaunchCountdownProps = Readonly<{
  locale: PublishedLocale;
  messages: LaunchCenterMessages["countdown"];
  targetUtc: string;
}>;

function formatRemaining(
  milliseconds: number,
  locale: PublishedLocale,
  messages: LaunchCenterMessages["countdown"],
): string {
  if (milliseconds <= 0) return messages.reachedOrPassed;
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    days > 0
      ? formatMessageTemplate(messages.units.day, { value: formatLocaleNumber(days, locale) })
      : null,
    days > 0 || hours > 0
      ? formatMessageTemplate(messages.units.hour, { value: formatLocaleNumber(hours, locale) })
      : null,
    formatMessageTemplate(messages.units.minute, { value: formatLocaleNumber(minutes, locale) }),
    formatMessageTemplate(messages.units.second, { value: formatLocaleNumber(seconds, locale) }),
  ].filter((value): value is string => value !== null);
  return parts.join(" ");
}

export function LaunchCountdown({ locale, messages, targetUtc }: LaunchCountdownProps) {
  const target = useMemo(() => new Date(targetUtc).getTime(), [targetUtc]);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <p className="text-sm font-semibold text-[var(--foreground)]">
      {messages.label}{" "}
      {now === null || !Number.isFinite(target)
        ? messages.loading
        : formatRemaining(target - now, locale, messages)}
    </p>
  );
}
