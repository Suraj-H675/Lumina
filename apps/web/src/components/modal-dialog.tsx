"use client";

import { useCallback, useEffect, useId, useRef } from "react";

type ModalDialogProps = Readonly<{
  children: React.ReactNode;
  description?: string;
  onClose: () => void;
  /** When true the dialog renders; callers own all open/close state. */
  open: boolean;
  title: string;
}>;

/**
 * Minimal accessible modal dialog for Lumina's local-first flows.
 *
 * role="dialog" labelled by its title (and optional description); Escape
 * closes; pressing the backdrop closes; initial focus lands on the first
 * field/button inside; focus is restored to the previously focused element
 * on close; Tab is trapped while open.
 *
 * Rendered inline rather than through a portal: Lumina's shell introduces no
 * transform/filter ancestors, so position:fixed overlays behave correctly,
 * and this keeps the component free of imperative DOM bookkeeping (and
 * jsdom-compatible for component tests). Only one bounded modal flow exists,
 * so no nested-dialog machinery is needed.
 */
export function ModalDialog({ children, description, onClose, open, title }: ModalDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTarget = panelRef.current?.querySelector<HTMLElement>(
      "input:not([disabled]), button:not([disabled]), select, textarea",
    );
    (focusTarget ?? panelRef.current)?.focus();
    return () => {
      previouslyFocused.current?.focus();
    };
  }, [open]);

  const focusFirstInside = useCallback(() => {
    const target = panelRef.current?.querySelector<HTMLElement>("input, button");
    target?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => {
        // A press that starts on the backdrop (not the panel) dismisses.
        if (!panelRef.current?.contains(event.target as Node)) onClose();
      }}
    >
      <div
        aria-describedby={description === undefined ? undefined : descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-2xl"
        onFocus={(event) => {
          // Belt-and-braces containment for any edge case the Tab trap misses.
          if (!panelRef.current?.contains(event.target as Node)) focusFirstInside();
        }}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]" id={titleId}>
          {title}
        </h2>
        {description !== undefined ? (
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]" id={descriptionId}>
            {description}
          </p>
        ) : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export type { ModalDialogProps };
