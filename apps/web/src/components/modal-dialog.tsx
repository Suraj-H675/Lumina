"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

type ModalDialogProps = Readonly<{
  children: React.ReactNode;
  description?: string;
  onClose: () => void;
  /** When true the dialog renders; callers own all open/close state. */
  open: boolean;
  title: string;
}>;

const FOCUSABLE_CANDIDATE_SELECTOR = "a[href], button, input, select, textarea, [tabindex]";

function tabbableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_CANDIDATE_SELECTOR)).filter(
    (element) => {
      if (element.matches(":disabled")) return false;
      if (element instanceof HTMLInputElement && element.type === "hidden") return false;
      if (element.closest("[hidden], [inert]") !== null) return false;
      const declaredTabIndex = element.getAttribute("tabindex");
      if (declaredTabIndex !== null && Number.parseInt(declaredTabIndex, 10) < 0) return false;
      return element.tabIndex >= 0;
    },
  );
}

/**
 * Minimal accessible modal dialog for Lumina's local-first flows.
 *
 * role="dialog" labelled by its title (and optional description); Escape
 * closes; pressing the backdrop closes; initial focus lands on the first
 * field/button inside; focus is restored to the previously focused element
 * on close; Tab is trapped while open.
 *
 * Rendered through document.body so the overlay is isolated from caller
 * stacking and layout contexts. Only one bounded modal flow exists, so no
 * nested-dialog machinery is needed.
 */
export function ModalDialog({ children, description, onClose, open, title }: ModalDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const focusFirstInside = useCallback(() => {
    const panel = panelRef.current;
    if (panel === null) return;
    (tabbableElements(panel)[0] ?? panel).focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const keepFocusInside = (event: FocusEvent) => {
      const panel = panelRef.current;
      if (panel !== null && event.target instanceof Node && !panel.contains(event.target)) {
        focusFirstInside();
      }
    };
    document.addEventListener("focusin", keepFocusInside);
    focusFirstInside();
    return () => {
      document.removeEventListener("focusin", keepFocusInside);
      previouslyFocused.current?.focus();
    };
  }, [focusFirstInside, open]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (panel === null) return;
      const focusables = tabbableElements(panel);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (first === undefined || last === undefined) {
        event.preventDefault();
        panel.focus();
        return;
      }
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

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/70 p-4 sm:items-center"
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
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-2xl"
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
    </div>,
    document.body,
  );
}

export type { ModalDialogProps };
