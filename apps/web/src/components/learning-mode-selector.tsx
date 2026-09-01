"use client";

import { useEffect, useState } from "react";

import { AUDIENCE_MODES, type AudienceMode } from "../lib/learning/content";

const PRESENTATION_MODE_KEY = "lumina.presentation-mode.v1";

const labels: Record<AudienceMode, string> = {
  "deep-dive": "Deep Dive",
  explorer: "Explorer",
  student: "Student",
};

type LearningModeSelectorProps = Readonly<{
  onChange: (mode: AudienceMode) => void;
}>;

export function LearningModeSelector({ onChange }: LearningModeSelectorProps) {
  const [mode, setMode] = useState<AudienceMode>("explorer");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PRESENTATION_MODE_KEY);
      if (saved !== null && AUDIENCE_MODES.includes(saved as AudienceMode)) {
        const savedMode = saved as AudienceMode;
        const timeoutId = window.setTimeout(() => {
          setMode(savedMode);
          onChange(savedMode);
        }, 0);
        return () => window.clearTimeout(timeoutId);
      }
    } catch {
      // A blocked preference must not prevent the lesson from rendering.
    }
    return undefined;
  }, [onChange]);

  function handleChange(next: string): void {
    if (!AUDIENCE_MODES.includes(next as AudienceMode)) return;
    const nextMode = next as AudienceMode;
    setMode(nextMode);
    onChange(nextMode);
    try {
      window.localStorage.setItem(PRESENTATION_MODE_KEY, nextMode);
    } catch {
      // The authored mode still changes for this view when persistence is unavailable.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm font-semibold" htmlFor="learning-presentation-mode">
        Presentation mode
      </label>
      <select
        className="min-h-11 rounded-sm border border-[var(--border)] bg-[var(--background-raised)] px-3 text-base text-[var(--foreground)]"
        id="learning-presentation-mode"
        onChange={(event) => handleChange(event.target.value)}
        value={mode}
      >
        {AUDIENCE_MODES.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
      <span className="text-sm text-[var(--muted)]">The science and answers stay the same.</span>
    </div>
  );
}
