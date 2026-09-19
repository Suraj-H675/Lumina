"use client";

import type { ParticipateResponse } from "@lumina/api-client";
import { useEffect, useMemo, useState } from "react";

import { formatLocaleNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { ParticipateMessages } from "../lib/i18n/messages/types";
import {
  PARTICIPATE_ALL_FILTER,
  cacheStateLabel,
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
  locale,
  messages,
  response,
}: Readonly<{
  locale: PublishedLocale;
  messages: ParticipateMessages;
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
          {messages.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {response.definition.title}
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{response.definition.summary}</p>
        <p className="leading-7 text-[var(--muted)]">{response.definition.privacy_note}</p>
      </header>

      <Freshness messages={messages} response={response} />

      <section aria-labelledby="participate-projects-heading" className="space-y-6">
        <div className="max-w-4xl space-y-3">
          <h2 className="text-3xl font-semibold" id="participate-projects-heading">
            {messages.projects.heading}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{messages.projects.description}</p>
        </div>

        <div
          aria-labelledby="participate-filter-heading"
          className="grid gap-4 border border-[var(--border)] bg-[var(--surface)] p-5 md:grid-cols-4"
        >
          <h3 className="sr-only" id="participate-filter-heading">
            {messages.projects.filters.heading}
          </h3>
          <FilterSelect
            allLabel={messages.projects.filters.all}
            label={messages.projects.filters.timeLabel}
            onChange={setTimeFilter}
            options={response.filters.time.map((value) => ({
              label: timeFilterLabel(value, messages),
              value,
            }))}
            value={timeFilter}
          />
          <FilterSelect
            allLabel={messages.projects.filters.all}
            label={messages.projects.filters.deviceLabel}
            onChange={setDeviceFilter}
            options={response.filters.device.map((value) => ({
              label: deviceFilterLabel(value, messages),
              value,
            }))}
            value={deviceFilter}
          />
          <FilterSelect
            allLabel={messages.projects.filters.all}
            label={messages.projects.filters.skillFocusLabel}
            onChange={setSkillFilter}
            options={response.filters.skill_focus.map((value) => ({
              label: skillFocusLabel(value, messages),
              value,
            }))}
            value={skillFilter}
          />
          <div className="flex flex-col justify-end gap-2">
            <span aria-live="polite" className="text-sm text-[var(--muted)]">
              {formatMessageTemplate(messages.projects.filters.shown, {
                shownCount: formatLocaleNumber(visibleProjects.length, locale),
                totalCount: formatLocaleNumber(response.projects.length, locale),
              })}
            </span>
            <button
              className="min-h-11 rounded-sm border border-[var(--border)] px-4 py-2 font-medium"
              onClick={resetFilters}
              type="button"
            >
              {messages.projects.filters.reset}
            </button>
          </div>
        </div>

        {visibleProjects.length === 0 ? (
          <p className="border border-[var(--border)] p-5" role="status">
            {messages.projects.filters.empty}
          </p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {visibleProjects.map((project) => (
              <ProjectCard
                handoffNotice={response.definition.external_handoff_notice}
                key={project.id}
                messages={messages}
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
            {messages.challenges.heading}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{messages.challenges.description}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {response.challenges.map((challenge) => (
            <ChallengeCard
              challenge={challenge}
              key={challenge.id}
              locale={locale}
              messages={messages}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="participate-activities-heading" className="space-y-6">
        <div className="max-w-4xl space-y-3">
          <h2 className="text-3xl font-semibold" id="participate-activities-heading">
            {messages.activities.heading}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{messages.activities.description}</p>
        </div>
        <div className="space-y-5">
          {response.activities.map((activity) => (
            <ActivityCard
              activity={activity}
              key={activity.id}
              messages={messages}
              sourceById={sourceById}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="participate-sources-heading" className="space-y-5">
        <h2 className="text-3xl font-semibold" id="participate-sources-heading">
          {messages.sourcesTitle}
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
  allLabel,
  label,
  value,
  options,
  onChange,
}: Readonly<{
  allLabel: string;
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
        <option value={PARTICIPATE_ALL_FILTER}>{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Freshness({
  messages,
  response,
}: Readonly<{ messages: ParticipateMessages; response: ParticipateResponse }>) {
  return (
    <section
      aria-labelledby="participate-freshness-heading"
      className="space-y-4 border-l-4 border-[var(--accent)] bg-[var(--surface)] p-5"
    >
      <h2 className="text-xl font-semibold" id="participate-freshness-heading">
        {freshnessHeading(response, messages)}
      </h2>
      <p className="leading-7 text-[var(--muted)]">{messages.freshness.description}</p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="font-medium">{messages.freshness.cacheStateLabel}</dt>
          <dd className="text-[var(--muted)]">
            {cacheStateLabel(response.freshness.cache_state, messages)}
          </dd>
        </div>
        <Timestamp
          label={messages.freshness.retrievedAtLabel}
          messages={messages}
          value={response.freshness.retrieved_at}
        />
        <Timestamp
          label={messages.freshness.freshUntilLabel}
          messages={messages}
          value={response.freshness.fresh_until}
        />
        <Timestamp
          label={messages.freshness.staleGraceEndsLabel}
          messages={messages}
          value={response.freshness.stale_until}
        />
      </dl>
    </section>
  );
}

function ProjectCard({
  handoffNotice,
  messages,
  project,
  sourceById,
}: Readonly<{
  handoffNotice: string;
  messages: ParticipateMessages;
  project: ParticipateProject;
  sourceById: ReadonlyMap<string, ParticipateSource>;
}>) {
  const handoffId = `participate-handoff-${project.id}`;
  return (
    <article className="flex h-full flex-col gap-4 border border-[var(--border)] p-5">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-[var(--accent)]">
          {projectStatusLabel(project, messages)}
        </p>
        <h3 className="text-2xl font-semibold">{project.title}</h3>
        <p className="leading-7 text-[var(--muted)]">{project.summary}</p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium">{messages.projects.labels.trainingTime}</dt>
          <dd className="text-[var(--muted)]">{project.time_label}</dd>
        </div>
        <div>
          <dt className="font-medium">{messages.projects.labels.device}</dt>
          <dd className="text-[var(--muted)]">{project.device_label}</dd>
        </div>
        <div>
          <dt className="font-medium">{messages.projects.labels.skillFocus}</dt>
          <dd className="text-[var(--muted)]">{skillFocusLabel(project.skill_focus, messages)}</dd>
        </div>
        <div>
          <dt className="font-medium">{messages.projects.labels.sourceUpdated}</dt>
          <dd className="text-[var(--muted)]">
            {timestampLabel(project.source_updated_at, messages)}
          </dd>
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
          {formatMessageTemplate(messages.projects.openOnZooniverse, {
            projectTitle: project.title,
          })}
        </a>
        <ReviewedSourceLinks ids={project.source_ids} messages={messages} sourceById={sourceById} />
      </div>
    </article>
  );
}

function ChallengeCard({
  challenge,
  locale,
  messages,
}: Readonly<{
  challenge: ParticipateChallenge;
  locale: PublishedLocale;
  messages: ParticipateMessages;
}>) {
  return (
    <details className="border border-[var(--border)] p-5">
      <summary className="min-h-11 cursor-pointer text-lg font-semibold">
        {formatMessageTemplate(messages.challenges.monthTitle, {
          challengeTitle: challenge.title,
          month: formatLocaleNumber(challenge.month, locale),
        })}
      </summary>
      <div className="mt-4 space-y-4">
        <p className="leading-7 text-[var(--muted)]">{challenge.summary}</p>
        <p className="text-sm">
          {formatMessageTemplate(messages.challenges.suggestedDuration, {
            duration: challenge.duration_label,
          })}
        </p>
        <ListBlock items={challenge.steps} ordered title={messages.challenges.stepsTitle} />
        <ListBlock items={challenge.safety} title={messages.challenges.safetyTitle} />
        <p className="text-sm leading-6 text-[var(--muted)]">{challenge.valid_limit_note}</p>
      </div>
    </details>
  );
}

function ActivityCard({
  activity,
  messages,
  sourceById,
}: Readonly<{
  activity: ParticipateActivity;
  messages: ParticipateMessages;
  sourceById: ReadonlyMap<string, ParticipateSource>;
}>) {
  return (
    <details className="border border-[var(--border)] p-5">
      <summary className="min-h-11 cursor-pointer text-xl font-semibold">{activity.title}</summary>
      <div className="mt-5 space-y-5">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <p>
            <span className="font-medium">{messages.activities.ageGuidanceLabel}</span>{" "}
            {activity.age_guidance}
          </p>
          <p>
            <span className="font-medium">{messages.activities.skillGuidanceLabel}</span>{" "}
            {activity.skill_guidance}
          </p>
          <p>
            <span className="font-medium">{messages.activities.durationLabel}</span>{" "}
            {activity.duration_label}
          </p>
        </div>
        <ListBlock items={activity.materials} title={messages.activities.materialsTitle} />
        <ListBlock items={activity.steps} ordered title={messages.activities.stepsTitle} />
        <div className="border-l-4 border-[var(--accent)] bg-[var(--surface)] p-4">
          <ListBlock items={activity.safety} title={messages.activities.safetyTitle} />
        </div>
        <dl className="grid gap-4 md:grid-cols-2">
          <div>
            <dt className="font-medium">{messages.activities.learningObjectiveLabel}</dt>
            <dd className="leading-7 text-[var(--muted)]">{activity.learning_objective}</dd>
          </div>
          <div>
            <dt className="font-medium">{messages.activities.expectedObservationLabel}</dt>
            <dd className="leading-7 text-[var(--muted)]">{activity.expected_observation}</dd>
          </div>
          <div>
            <dt className="font-medium">{messages.activities.cleanupLabel}</dt>
            <dd className="leading-7 text-[var(--muted)]">{activity.cleanup}</dd>
          </div>
          <div>
            <dt className="font-medium">{messages.activities.supervisionLabel}</dt>
            <dd className="leading-7 text-[var(--muted)]">{activity.adult_supervision_note}</dd>
          </div>
        </dl>
        <ListBlock items={activity.limitations} title={messages.activities.limitationsTitle} />
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
        <ReviewedSourceLinks
          ids={activity.source_ids}
          messages={messages}
          sourceById={sourceById}
        />
      </div>
    </details>
  );
}

function ReviewedSourceLinks({
  ids,
  messages,
  sourceById,
}: Readonly<{
  ids: readonly string[];
  messages: ParticipateMessages;
  sourceById: ReadonlyMap<string, ParticipateSource>;
}>) {
  return (
    <ul className="space-y-1 text-sm">
      {ids.map((sourceId) => {
        const source = sourceById.get(sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <span className="text-[var(--muted)]">
                {formatMessageTemplate(messages.projects.unavailableReviewedSource, { sourceId })}
              </span>
            ) : (
              <a
                className="inline-flex min-h-11 items-center text-[var(--link)] underline underline-offset-4"
                href={source.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                {formatMessageTemplate(messages.projects.sourceLink, {
                  sourceTitle: source.title,
                })}
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

function Timestamp({
  label,
  messages,
  value,
}: Readonly<{ label: string; messages: ParticipateMessages; value: string | null }>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-[var(--muted)]">{timestampLabel(value, messages)}</dd>
    </div>
  );
}
