"use client";

import type { ParticipateResponse } from "@lumina/api-client";
import { useEffect, useMemo, useState } from "react";

import {
  PARTICIPATE_ALL_FILTER,
  deviceFilterLabel,
  freshnessHeading,
  projectStatusLabel,
  skillFocusLabel,
  timeFilterLabel,
  timestampLabel,
  type ParticipateActivity,
  type ParticipateChallenge,
  type ParticipateProject,
  type ParticipateSource,
} from "../lib/participate";

type FilterValue = typeof PARTICIPATE_ALL_FILTER | string;

export function ParticipateView({
  response,
}: Readonly<{
  response: ParticipateResponse;
}>) {
  const [timeFilter, setTimeFilter] = useState<FilterValue>(PARTICIPATE_ALL_FILTER);
  const [deviceFilter, setDeviceFilter] = useState<FilterValue>(PARTICIPATE_ALL_FILTER);
  const [skillFilter, setSkillFilter] = useState<FilterValue>(PARTICIPATE_ALL_FILTER);
  const sourceById = useMemo(
    () => new Map(response.sources.map((source) => [source.id, source])),
    [response.sources],
  );
  const visibleProjects = useMemo(
    () =>
      response.projects.filter(
        (project) =>
          (timeFilter === PARTICIPATE_ALL_FILTER || project.time_filter === timeFilter) &&
          (deviceFilter === PARTICIPATE_ALL_FILTER ||
            project.device_filters.includes(
              deviceFilter as ParticipateProject["device_filters"][number],
            )) &&
          (skillFilter === PARTICIPATE_ALL_FILTER || project.skill_focus === skillFilter),
      ),
    [deviceFilter, response.projects, skillFilter, timeFilter],
  );

  useEffect(() => {
    const fallback = document.querySelector<HTMLElement>("[data-participate-fallback]");
    if (fallback === null) return;
    fallback.hidden = true;
    return () => {
      fallback.hidden = false;
    };
  }, []);

  function resetFilters() {
    setTimeFilter(PARTICIPATE_ALL_FILTER);
    setDeviceFilter(PARTICIPATE_ALL_FILTER);
    setSkillFilter(PARTICIPATE_ALL_FILTER);
  }

  return (
    <article className="max-w-6xl space-y-12">
      <header className="max-w-4xl space-y-5">
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          Participate
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {response.definition.title}
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{response.definition.summary}</p>
        <p className="leading-7 text-[var(--muted)]">{response.definition.privacy_note}</p>
      </header>

      <Freshness response={response} />

      <section aria-labelledby="participate-projects-heading" className="space-y-6">
        <div className="max-w-4xl space-y-3">
          <h2 className="text-3xl font-semibold" id="participate-projects-heading">
            Citizen-science projects
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            Six reviewed astronomy projects. The filters describe task shape and source-reported
            training/device context; skill focus is not a difficulty ranking.
          </p>
        </div>

        <div
          aria-labelledby="participate-filter-heading"
          className="grid gap-4 border border-[var(--border)] bg-[var(--surface)] p-5 md:grid-cols-4"
        >
          <h3 className="sr-only" id="participate-filter-heading">
            Filter citizen-science projects
          </h3>
          <FilterSelect
            label="Training time"
            onChange={setTimeFilter}
            options={response.filters.time.map((value) => ({
              label: timeFilterLabel(value),
              value,
            }))}
            value={timeFilter}
          />
          <FilterSelect
            label="Device"
            onChange={setDeviceFilter}
            options={response.filters.device.map((value) => ({
              label: deviceFilterLabel(value),
              value,
            }))}
            value={deviceFilter}
          />
          <FilterSelect
            label="Skill focus"
            onChange={setSkillFilter}
            options={response.filters.skill_focus.map((value) => ({
              label: skillFocusLabel(value),
              value,
            }))}
            value={skillFilter}
          />
          <div className="flex flex-col justify-end gap-2">
            <span aria-live="polite" className="text-sm text-[var(--muted)]">
              {visibleProjects.length} of {response.projects.length} projects shown
            </span>
            <button
              className="min-h-11 rounded-sm border border-[var(--border)] px-4 py-2 font-medium"
              onClick={resetFilters}
              type="button"
            >
              Reset filters
            </button>
          </div>
        </div>

        {visibleProjects.length === 0 ? (
          <p className="border border-[var(--border)] p-5" role="status">
            No reviewed project matches all three filters. Reset or broaden a filter.
          </p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {visibleProjects.map((project) => (
              <ProjectCard
                handoffNotice={response.definition.external_handoff_notice}
                key={project.id}
                project={project}
                sourceById={sourceById}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="participate-challenges-heading" className="space-y-6">
        <div className="max-w-4xl space-y-3">
          <h2 className="text-3xl font-semibold" id="participate-challenges-heading">
            Twelve evergreen monthly challenges
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            These prompts do not predict that a target or event is visible from your hemisphere,
            latitude, weather, or current sky. Lumina does not request or store location for these
            challenges.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {response.challenges.map((challenge) => (
            <ChallengeCard challenge={challenge} key={challenge.id} />
          ))}
        </div>
      </section>

      <section aria-labelledby="participate-activities-heading" className="space-y-6">
        <div className="max-w-4xl space-y-3">
          <h2 className="text-3xl font-semibold" id="participate-activities-heading">
            Hands-on activities
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            Reviewed materials, steps, safety notes, expected observations, cleanup, supervision,
            and limitations are shown together so an activity is never separated from its safety
            boundary.
          </p>
        </div>
        <div className="space-y-5">
          {response.activities.map((activity) => (
            <ActivityCard activity={activity} key={activity.id} sourceById={sourceById} />
          ))}
        </div>
      </section>

      <section aria-labelledby="participate-sources-heading" className="space-y-5">
        <h2 className="text-3xl font-semibold" id="participate-sources-heading">
          Reviewed sources
        </h2>
        <ul className="grid gap-4 lg:grid-cols-2">
          {response.sources.map((source) => (
            <li className="border border-[var(--border)] p-5" key={source.id}>
              <a
                className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline underline-offset-4"
                href={source.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                {source.title}
              </a>
              <p className="text-sm text-[var(--muted)]">{source.organization}</p>
              <p className="mt-3 leading-7 text-[var(--muted)]">{source.claim_scope}</p>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: FilterValue;
  options: ReadonlyArray<Readonly<{ label: string; value: string }>>;
  onChange: (value: string) => void;
}>) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      <span>{label}</span>
      <select
        className="min-h-11 border border-[var(--border)] bg-[var(--background)] px-3 py-2"
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        <option value={PARTICIPATE_ALL_FILTER}>All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Freshness({ response }: Readonly<{ response: ParticipateResponse }>) {
  return (
    <section
      aria-labelledby="participate-freshness-heading"
      className="space-y-4 border-l-4 border-[var(--accent)] bg-[var(--surface)] p-5"
    >
      <h2 className="text-xl font-semibold" id="participate-freshness-heading">
        {freshnessHeading(response)}
      </h2>
      <p className="leading-7 text-[var(--muted)]">
        Project status comes only from Lumina&apos;s last validated Panoptes cache. This page does
        not contact Zooniverse from your browser. Reviewed descriptions, challenges, activities, and
        source links remain Lumina-owned static content.
      </p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="font-medium">Cache state</dt>
          <dd className="text-[var(--muted)]">{response.freshness.cache_state}</dd>
        </div>
        <Timestamp label="Retrieved at" value={response.freshness.retrieved_at} />
        <Timestamp label="Fresh until" value={response.freshness.fresh_until} />
        <Timestamp label="Stale grace ends" value={response.freshness.stale_until} />
      </dl>
    </section>
  );
}

function ProjectCard({
  project,
  sourceById,
  handoffNotice,
}: Readonly<{
  project: ParticipateProject;
  sourceById: ReadonlyMap<string, ParticipateSource>;
  handoffNotice: string;
}>) {
  const handoffId = `participate-handoff-${project.id}`;
  return (
    <article className="flex h-full flex-col gap-4 border border-[var(--border)] p-5">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-[var(--accent)]">{projectStatusLabel(project)}</p>
        <h3 className="text-2xl font-semibold">{project.title}</h3>
        <p className="leading-7 text-[var(--muted)]">{project.summary}</p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium">Training/time</dt>
          <dd className="text-[var(--muted)]">{project.time_label}</dd>
        </div>
        <div>
          <dt className="font-medium">Device</dt>
          <dd className="text-[var(--muted)]">{project.device_label}</dd>
        </div>
        <div>
          <dt className="font-medium">Skill focus</dt>
          <dd className="text-[var(--muted)]">{skillFocusLabel(project.skill_focus)}</dd>
        </div>
        <div>
          <dt className="font-medium">Source updated</dt>
          <dd className="text-[var(--muted)]">{timestampLabel(project.source_updated_at)}</dd>
        </div>
      </dl>
      <p className="text-sm leading-6 text-[var(--muted)]">{project.knowledge_note}</p>
      <div className="mt-auto space-y-3">
        <p className="text-sm leading-6 text-[var(--muted)]" id={handoffId}>
          {handoffNotice}
        </p>
        <a
          aria-describedby={handoffId}
          className="inline-flex min-h-11 items-center font-semibold text-[var(--link)] underline underline-offset-4"
          href={project.external_url}
          rel="noopener noreferrer"
          target="_blank"
        >
          Open {project.title} on Zooniverse
        </a>
        <ReviewedSourceLinks ids={project.source_ids} sourceById={sourceById} />
      </div>
    </article>
  );
}

function ChallengeCard({ challenge }: Readonly<{ challenge: ParticipateChallenge }>) {
  return (
    <details className="border border-[var(--border)] p-5">
      <summary className="min-h-11 cursor-pointer text-lg font-semibold">
        Month {challenge.month}: {challenge.title}
      </summary>
      <div className="mt-4 space-y-4">
        <p className="leading-7 text-[var(--muted)]">{challenge.summary}</p>
        <p className="text-sm">
          <span className="font-medium">Suggested duration:</span> {challenge.duration_label}
        </p>
        <ListBlock items={challenge.steps} ordered title="Steps" />
        <ListBlock items={challenge.safety} title="Safety" />
        <p className="text-sm leading-6 text-[var(--muted)]">{challenge.valid_limit_note}</p>
      </div>
    </details>
  );
}

function ActivityCard({
  activity,
  sourceById,
}: Readonly<{
  activity: ParticipateActivity;
  sourceById: ReadonlyMap<string, ParticipateSource>;
}>) {
  return (
    <details className="border border-[var(--border)] p-5">
      <summary className="min-h-11 cursor-pointer text-xl font-semibold">{activity.title}</summary>
      <div className="mt-5 space-y-5">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <p>
            <span className="font-medium">Age guidance:</span> {activity.age_guidance}
          </p>
          <p>
            <span className="font-medium">Skill guidance:</span> {activity.skill_guidance}
          </p>
          <p>
            <span className="font-medium">Duration:</span> {activity.duration_label}
          </p>
        </div>
        <ListBlock items={activity.materials} title="Materials" />
        <ListBlock items={activity.steps} ordered title="Steps" />
        <div className="border-l-4 border-[var(--accent)] bg-[var(--surface)] p-4">
          <ListBlock items={activity.safety} title="Safety" />
        </div>
        <dl className="grid gap-4 md:grid-cols-2">
          <div>
            <dt className="font-medium">Learning objective</dt>
            <dd className="leading-7 text-[var(--muted)]">{activity.learning_objective}</dd>
          </div>
          <div>
            <dt className="font-medium">Expected observation</dt>
            <dd className="leading-7 text-[var(--muted)]">{activity.expected_observation}</dd>
          </div>
          <div>
            <dt className="font-medium">Cleanup</dt>
            <dd className="leading-7 text-[var(--muted)]">{activity.cleanup}</dd>
          </div>
          <div>
            <dt className="font-medium">Supervision</dt>
            <dd className="leading-7 text-[var(--muted)]">{activity.adult_supervision_note}</dd>
          </div>
        </dl>
        <ListBlock items={activity.limitations} title="Limitations" />
        {activity.external_resource === null ? null : (
          <a
            className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline underline-offset-4"
            href={activity.external_resource.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {activity.external_resource.label}
          </a>
        )}
        <ReviewedSourceLinks ids={activity.source_ids} sourceById={sourceById} />
      </div>
    </details>
  );
}

function ReviewedSourceLinks({
  ids,
  sourceById,
}: Readonly<{
  ids: readonly string[];
  sourceById: ReadonlyMap<string, ParticipateSource>;
}>) {
  return (
    <ul className="space-y-1 text-sm">
      {ids.map((sourceId) => {
        const source = sourceById.get(sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <span className="text-[var(--muted)]">Unavailable reviewed source: {sourceId}</span>
            ) : (
              <a
                className="inline-flex min-h-11 items-center text-[var(--link)] underline underline-offset-4"
                href={source.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                Source: {source.title}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ListBlock({
  title,
  items,
  ordered = false,
}: Readonly<{
  title: string;
  items: readonly string[];
  ordered?: boolean;
}>) {
  const className = ordered ? "list-decimal space-y-2 pl-6" : "list-disc space-y-2 pl-6";
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{title}</h3>
      {ordered ? (
        <ol className={className}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      ) : (
        <ul className={className}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Timestamp({ label, value }: Readonly<{ label: string; value: string | null }>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-[var(--muted)]">{timestampLabel(value)}</dd>
    </div>
  );
}
