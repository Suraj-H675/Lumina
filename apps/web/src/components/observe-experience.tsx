"use client";

import { useSyncExternalStore } from "react";

import { ObservationPlanner, type ObservationPlannerProps } from "./observation-planner";
import { SavedObservationPlanView } from "./saved-observation-plan-view";

type ObserveExperienceProps = ObservationPlannerProps &
  Readonly<{
    initialSavedId?: string;
  }>;

function subscribeLocation(onStoreChange: () => void): () => void {
  window.addEventListener("popstate", onStoreChange);
  return () => {
    window.removeEventListener("popstate", onStoreChange);
  };
}

function savedIdFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("saved")) return null;
  return params.get("saved") ?? "";
}

export function ObserveExperience({ initialSavedId, ...plannerProps }: ObserveExperienceProps) {
  const browserSavedId = useSyncExternalStore(
    subscribeLocation,
    savedIdFromLocation,
    () => initialSavedId ?? null,
  );
  const savedId = browserSavedId ?? initialSavedId ?? null;

  if (savedId !== null) return <SavedObservationPlanView savedId={savedId} />;
  return <ObservationPlanner {...plannerProps} />;
}
