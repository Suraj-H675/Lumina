"use client";

import { useEffect, useState } from "react";

import { usePresentationModeMessages } from "../lib/i18n/presentation-mode-context";
import { AUDIENCE_MODES, type AudienceMode } from "../lib/learning/content";
import styles from "./learning-experience.module.css";

const PRESENTATION_MODE_KEY = "lumina.presentation-mode.v1";

type LearningModeSelectorProps = Readonly<{
  onChange: (mode: AudienceMode) => void;
}>;

export function LearningModeSelector({ onChange }: LearningModeSelectorProps) {
  const messages = usePresentationModeMessages();
  const [mode, setMode] = useState<AudienceMode>("explorer");

  function optionLabel(option: AudienceMode): string {
    switch (option) {
      case "deep-dive":
        return messages.options.deepDive;
      case "explorer":
        return messages.options.explorer;
      case "student":
        return messages.options.student;
    }
  }

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
    <div className={styles.modeBar}>
      <label className={styles.modeLabel} htmlFor="learning-presentation-mode">
        {messages.label}
      </label>
      <select
        className={styles.modeSelect}
        id="learning-presentation-mode"
        onChange={(event) => handleChange(event.target.value)}
        value={mode}
      >
        {AUDIENCE_MODES.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
      <span className={styles.modeDescription}>{messages.description}</span>
    </div>
  );
}
