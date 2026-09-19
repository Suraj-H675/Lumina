import type { ParticipateResponse } from "@lumina/api-client";

import { formatLocaleNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { ParticipateMessages } from "../lib/i18n/messages/types";
import {
  cacheStateLabel,
  freshnessHeading,
  projectStatusLabel,
  skillFocusLabel,
  timeFilterLabel,
  timestampLabel,
} from "../lib/participate";

export function ParticipateNoScript({
  locale,
  messages,
  response,
}: Readonly<{
  locale: PublishedLocale;
  messages: ParticipateMessages;
  response: ParticipateResponse;
}>) {
  const sourceById = new Map(response.sources.map((source) => [source.id, source]));

  return (
    <article className="max-w-6xl space-y-10" data-participate-fallback>
      <header>
        <p>{messages.eyebrow}</p>
        <h1>{response.definition.title}</h1>
        <p>{response.definition.summary}</p>
        <p>{response.definition.privacy_note}</p>
      </header>

      <section aria-labelledby="participate-nojs-status-heading">
        <h2 id="participate-nojs-status-heading">{freshnessHeading(response, messages)}</h2>
        <p>{messages.freshness.noScriptDescription}</p>
        <p>
          {formatMessageTemplate(messages.freshness.noScriptCacheState, {
            cacheState: cacheStateLabel(response.freshness.cache_state, messages),
          })}
        </p>
        <p>
          {formatMessageTemplate(messages.freshness.noScriptRetrievedAt, {
            timestamp: timestampLabel(response.freshness.retrieved_at, messages),
          })}
        </p>
        <p>
          {formatMessageTemplate(messages.freshness.noScriptFreshUntil, {
            timestamp: timestampLabel(response.freshness.fresh_until, messages),
          })}
        </p>
        <p>
          {formatMessageTemplate(messages.freshness.noScriptStaleGraceEnds, {
            timestamp: timestampLabel(response.freshness.stale_until, messages),
          })}
        </p>
      </section>

      <section aria-labelledby="participate-nojs-projects-heading">
        <h2 id="participate-nojs-projects-heading">{messages.projects.heading}</h2>
        <p>{messages.projects.noScriptDescription}</p>
        {response.projects.map((project) => (
          <article key={project.id}>
            <h3>{project.title}</h3>
            <p>{project.summary}</p>
            <dl>
              <div>
                <dt>{messages.projects.labels.currentStatus}</dt>
                <dd>{projectStatusLabel(project, messages)}</dd>
              </div>
              <div>
                <dt>{messages.projects.labels.trainingTime}</dt>
                <dd>
                  {formatMessageTemplate(messages.projects.trainingTimeValue, {
                    filterLabel: timeFilterLabel(project.time_filter, messages),
                    timeLabel: project.time_label,
                  })}
                </dd>
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
                <dt>{messages.projects.labels.providerSourceUpdated}</dt>
                <dd>{timestampLabel(project.source_updated_at, messages)}</dd>
              </div>
            </dl>
            <p>{project.knowledge_note}</p>
            <p>{response.definition.external_handoff_notice}</p>
            <p>
              <a href={project.external_url} rel="noopener noreferrer" target="_blank">
                {formatMessageTemplate(messages.projects.openOnZooniverse, {
                  projectTitle: project.title,
                })}
              </a>
            </p>
            <ul>
              {project.source_ids.map((sourceId) => {
                const source = sourceById.get(sourceId);
                return (
                  <li key={sourceId}>
                    {source === undefined ? (
                      <>
                        {formatMessageTemplate(messages.projects.unavailableReviewedSource, {
                          sourceId,
                        })}
                      </>
                    ) : (
                      <a href={source.url} rel="noopener noreferrer" target="_blank">
                        {formatMessageTemplate(messages.projects.sourceAttribution, {
                          organization: source.organization,
                          sourceTitle: source.title,
                        })}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </section>

      <section aria-labelledby="participate-nojs-challenges-heading">
        <h2 id="participate-nojs-challenges-heading">{messages.challenges.heading}</h2>
        <p>{messages.challenges.noScriptDescription}</p>
        {response.challenges.map((challenge) => (
          <article key={challenge.id}>
            <h3>
              {formatMessageTemplate(messages.challenges.monthTitle, {
                challengeTitle: challenge.title,
                month: formatLocaleNumber(challenge.month, locale),
              })}
            </h3>
            <p>{challenge.summary}</p>
            <p>
              {formatMessageTemplate(messages.challenges.suggestedDuration, {
                duration: challenge.duration_label,
              })}
            </p>
            <h4>{messages.challenges.stepsTitle}</h4>
            <ol>
              {challenge.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <h4>{messages.challenges.safetyTitle}</h4>
            <ul>
              {challenge.safety.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>{challenge.valid_limit_note}</p>
          </article>
        ))}
      </section>

      <section aria-labelledby="participate-nojs-activities-heading">
        <h2 id="participate-nojs-activities-heading">{messages.activities.heading}</h2>
        {response.activities.map((activity) => (
          <article key={activity.id}>
            <h3>{activity.title}</h3>
            <p>{activity.age_guidance}</p>
            <p>{activity.skill_guidance}</p>
            <p>
              {formatMessageTemplate(messages.activities.suggestedDuration, {
                duration: activity.duration_label,
              })}
            </p>
            <h4>{messages.activities.materialsTitle}</h4>
            <ul>
              {activity.materials.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h4>{messages.activities.stepsTitle}</h4>
            <ol>
              {activity.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <h4>{messages.activities.safetyTitle}</h4>
            <ul>
              {activity.safety.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>
              {formatMessageTemplate(messages.activities.noScriptLearningObjective, {
                objective: activity.learning_objective,
              })}
            </p>
            <p>
              {formatMessageTemplate(messages.activities.noScriptExpectedObservation, {
                observation: activity.expected_observation,
              })}
            </p>
            <p>
              {formatMessageTemplate(messages.activities.noScriptCleanup, {
                cleanup: activity.cleanup,
              })}
            </p>
            <p>{activity.adult_supervision_note}</p>
            <h4>{messages.activities.limitationsTitle}</h4>
            <ul>
              {activity.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {activity.external_resource === null ? null : (
              <p>
                <a href={activity.external_resource.url} rel="noopener noreferrer" target="_blank">
                  {activity.external_resource.label}
                </a>
              </p>
            )}
          </article>
        ))}
      </section>

      <section aria-labelledby="participate-nojs-sources-heading">
        <h2 id="participate-nojs-sources-heading">{messages.sourcesTitle}</h2>
        <ul>
          {response.sources.map((source) => (
            <li key={source.id}>
              <a href={source.url} rel="noopener noreferrer" target="_blank">
                {formatMessageTemplate(messages.projects.sourceAttribution, {
                  organization: source.organization,
                  sourceTitle: source.title,
                })}
              </a>
              <p>{source.claim_scope}</p>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
