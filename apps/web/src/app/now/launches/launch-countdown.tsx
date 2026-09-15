"use client";

import { useEffect, useMemo, useState } from "react";

type LaunchCountdownProps = Readonly<{
  targetUtc: string;
}>;

function formatRemaining(milliseconds: number): string {
  if (milliseconds <= 0) return "Launch time reached or passed";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    days > 0 ? `${days}d` : null,
    days > 0 || hours > 0 ? `${hours}h` : null,
    `${minutes}m`,
    `${seconds}s`,
  ].filter((value): value is string => value !== null);
  return parts.join(" ");
}

export function LaunchCountdown({ targetUtc }: LaunchCountdownProps) {
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
      Exact countdown:{" "}
      {now === null || !Number.isFinite(target) ? "loading…" : formatRemaining(target - now)}
    </p>
  );
}
