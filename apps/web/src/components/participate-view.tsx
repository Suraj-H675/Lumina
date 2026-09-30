"use client";

import type { ParticipateResponse } from "@nova-lumina/api-client";
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
import styles from "./participate-experience.module.css";

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
    <article className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title}>{response.definition.title}</h1>
        </div>
        <div className={styles.heroAside}>
          <p className={styles.intro}>{response.definition.summary}</p>
          <p className={styles.privacy}>{response.definition.privacy_note}</p>
        </div>
      </header>

      <Freshness messages={messages} response={response} />

      <section aria-labelledby="participate-projects-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="participate-projects-heading">
            {messages.projects.heading}
          </h2>
          <p className={styles.sectionDescription}>{messages.projects.description}</p>
        </div>

        <div className={styles.sectionBody}>
          <div aria-labelledby="participate-filter-heading" className={styles.filters}>
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
            <div className={styles.filterSummary}>
              <span aria-live="polite" className={styles.shown}>
                {formatMessageTemplate(messages.projects.filters.shown, {
                  shownCount: formatLocaleNumber(visibleProjects.length, locale),
                  totalCount: formatLocaleNumber(response.projects.length, locale),
                })}
              </span>
              <button className={styles.textButton} onClick={resetFilters} type="button">
                {messages.projects.filters.reset}
              </button>
            </div>
          </div>

          {visibleProjects.length === 0 ? (
            <p className={styles.empty} role="status">
              {messages.projects.filters.empty}
            </p>
          ) : (
            <div className={styles.projectList}>
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
        </div>
      </section>

      <section aria-labelledby="participate-challenges-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="participate-challenges-heading">
            {messages.challenges.heading}
          </h2>
          <p className={styles.sectionDescription}>{messages.challenges.description}</p>
        </div>
        <div className={styles.timeline}>
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

      <section aria-labelledby="participate-activities-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="participate-activities-heading">
            {messages.activities.heading}
          </h2>
          <p className={styles.sectionDescription}>{messages.activities.description}</p>
        </div>
        <div className={styles.activityList}>
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

      <section aria-labelledby="participate-sources-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="participate-sources-heading">
            {messages.sourcesTitle}
          </h2>
        </div>
        <ul className={styles.sourceIndex}>
          {response.sources.map((source) => (
            <li className={styles.source} key={source.id}>
              <a
                className={styles.sourceLink}
                href={source.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                {source.title}
              </a>
              <p className={styles.sourceOrg}>{source.organization}</p>
              <p className={styles.sourceScope}>{source.claim_scope}</p>
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
    <label className={styles.filter}>
      <span>{label}</span>
      <select onChange={(event) => onChange(event.currentTarget.value)} value={value}>
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
    <section aria-labelledby="participate-freshness-heading" className={styles.freshness}>
      <h2 className={styles.freshnessTitle} id="participate-freshness-heading">
        {freshnessHeading(response, messages)}
      </h2>
      <div className={styles.freshnessBody}>
        <p className={styles.freshnessDescription}>{messages.freshness.description}</p>
        <dl className={styles.freshnessFacts}>
          <div>
            <dt>{messages.freshness.cacheStateLabel}</dt>
            <dd>{cacheStateLabel(response.freshness.cache_state, messages)}</dd>
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
      </div>
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
    <article className={styles.project}>
      <div className={styles.projectRail}>
        <p className={styles.projectStatus}>{projectStatusLabel(project, messages)}</p>
        <h3 className={styles.projectTitle}>{project.title}</h3>
      </div>
      <div className={styles.projectBody}>
        <p className={styles.projectSummary}>{project.summary}</p>
        <dl className={styles.projectFacts}>
          <div>
            <dt>{messages.projects.labels.trainingTime}</dt>
            <dd>{project.time_label}</dd>
          </div>
          <div>
            <dt>{messages.projects.labels.device}</dt>
            <dd>{project.device_label}</dd>
          </div>
          <div>
            <dt>{messages.projects.labels.skillFocus}</dt>
            <dd>{skillFocusLabel(project.skill_focus, messages)}</dd>
          </div>
          <div>
            <dt>{messages.projects.labels.sourceUpdated}</dt>
            <dd>{timestampLabel(project.source_updated_at, messages)}</dd>
          </div>
        </dl>
        <p className={styles.knowledge}>{project.knowledge_note}</p>
        <p className={styles.handoff} id={handoffId}>
          {handoffNotice}
        </p>
        <div className={styles.projectActions}>
          <a
            aria-describedby={handoffId}
            className={styles.projectLink}
            href={project.external_url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {formatMessageTemplate(messages.projects.openOnZooniverse, {
              projectTitle: project.title,
            })}
          </a>
          <ReviewedSourceLinks
            ids={project.source_ids}
            messages={messages}
            sourceById={sourceById}
          />
        </div>
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
    <details className={styles.timelineItem}>
      <summary className={styles.timelineSummary}>
        {formatMessageTemplate(messages.challenges.monthTitle, {
          challengeTitle: challenge.title,
          month: formatLocaleNumber(challenge.month, locale),
        })}
      </summary>
      <div className={styles.timelineContent}>
        <p>{challenge.summary}</p>
        <p className={styles.duration}>
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
    <details className={styles.activity}>
      <summary className={styles.activitySummary}>{activity.title}</summary>
      <div className={styles.activityContent}>
        <div className={styles.activityMeta}>
          <p>
            <span>{messages.activities.ageGuidanceLabel}</span> {activity.age_guidance}
          </p>
          <p>
            <span>{messages.activities.skillGuidanceLabel}</span> {activity.skill_guidance}
          </p>
          <p>
            <span>{messages.activities.durationLabel}</span> {activity.duration_label}
          </p>
        </div>
        <ListBlock items={activity.materials} title={messages.activities.materialsTitle} />
        <ListBlock items={activity.steps} ordered title={messages.activities.stepsTitle} />
        <div className={styles.safety}>
          <ListBlock items={activity.safety} title={messages.activities.safetyTitle} />
        </div>
        <dl className={styles.activityFacts}>
          <div>
            <dt>{messages.activities.learningObjectiveLabel}</dt>
            <dd>{activity.learning_objective}</dd>
          </div>
          <div>
            <dt>{messages.activities.expectedObservationLabel}</dt>
            <dd>{activity.expected_observation}</dd>
          </div>
          <div>
            <dt>{messages.activities.cleanupLabel}</dt>
            <dd>{activity.cleanup}</dd>
          </div>
          <div>
            <dt>{messages.activities.supervisionLabel}</dt>
            <dd>{activity.adult_supervision_note}</dd>
          </div>
        </dl>
        <ListBlock items={activity.limitations} title={messages.activities.limitationsTitle} />
        {activity.external_resource === null ? null : (
          <a
            className={styles.resourceLink}
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
    <ul className={styles.sourceLinks}>
      {ids.map((sourceId) => {
        const source = sourceById.get(sourceId);
        return (
          <li key={sourceId}>
            {source === undefined ? (
              <span className={styles.sourceScope}>
                {formatMessageTemplate(messages.projects.unavailableReviewedSource, { sourceId })}
              </span>
            ) : (
              <a
                className={styles.sourceLink}
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
  return (
    <section className={styles.listBlock}>
      <h3>{title}</h3>
      {ordered ? (
        <ol>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      ) : (
        <ul>
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
      <dt>{label}</dt>
      <dd>{timestampLabel(value, messages)}</dd>
    </div>
  );
}
