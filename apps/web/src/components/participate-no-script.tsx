import type { ParticipateResponse } from "@lumina/api-client";

import {
  freshnessHeading,
  projectStatusLabel,
  skillFocusLabel,
  timeFilterLabel,
  timestampLabel,
} from "../lib/participate";

export function ParticipateNoScript({
  response,
}: Readonly<{
  response: ParticipateResponse;
}>) {
  const sourceById = new Map(response.sources.map((source) => [source.id, source]));

  return (
    <article className="max-w-6xl space-y-10" data-participate-fallback>
      <header>
        <p>Participate</p>
        <h1>{response.definition.title}</h1>
        <p>{response.definition.summary}</p>
        <p>{response.definition.privacy_note}</p>
      </header>

      <section aria-labelledby="participate-nojs-status-heading">
        <h2 id="participate-nojs-status-heading">{freshnessHeading(response)}</h2>
        <p>
          Panoptes status is read only from Lumina&apos;s last validated server-side cache. This
          page does not contact Zooniverse from your browser.
        </p>
        <p>Cache state: {response.freshness.cache_state}</p>
        <p>Retrieved at: {timestampLabel(response.freshness.retrieved_at)}</p>
        <p>Fresh until: {timestampLabel(response.freshness.fresh_until)}</p>
        <p>Stale grace ends: {timestampLabel(response.freshness.stale_until)}</p>
      </section>

      <section aria-labelledby="participate-nojs-projects-heading">
        <h2 id="participate-nojs-projects-heading">Citizen-science projects</h2>
        <p>
          Filters require JavaScript, so all six reviewed projects are listed here. Skill focus
          describes the task, not a difficulty ranking.
        </p>
        {response.projects.map((project) => (
          <article key={project.id}>
            <h3>{project.title}</h3>
            <p>{project.summary}</p>
            <dl>
              <div>
                <dt>Current status</dt>
                <dd>{projectStatusLabel(project)}</dd>
              </div>
              <div>
                <dt>Training/time</dt>
                <dd>
                  {timeFilterLabel(project.time_filter)} — {project.time_label}
                </dd>
              </div>
              <div>
                <dt>Device</dt>
                <dd>{project.device_label}</dd>
              </div>
              <div>
                <dt>Skill focus</dt>
                <dd>{skillFocusLabel(project.skill_focus)}</dd>
              </div>
              <div>
                <dt>Provider source updated</dt>
                <dd>{timestampLabel(project.source_updated_at)}</dd>
              </div>
            </dl>
            <p>{project.knowledge_note}</p>
            <p>{response.definition.external_handoff_notice}</p>
            <p>
              <a href={project.external_url} rel="noopener noreferrer" target="_blank">
                Open {project.title} on Zooniverse
              </a>
            </p>
            <ul>
              {project.source_ids.map((sourceId) => {
                const source = sourceById.get(sourceId);
                return (
                  <li key={sourceId}>
                    {source === undefined ? (
                      <>Unavailable reviewed source: {sourceId}</>
                    ) : (
                      <a href={source.url} rel="noopener noreferrer" target="_blank">
                        {source.title} — {source.organization}
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
        <h2 id="participate-nojs-challenges-heading">Twelve evergreen monthly challenges</h2>
        <p>
          These are authored observing prompts, not visibility predictions for your location or
          hemisphere. Lumina does not request or store location for them.
        </p>
        {response.challenges.map((challenge) => (
          <article key={challenge.id}>
            <h3>
              Month {challenge.month}: {challenge.title}
            </h3>
            <p>{challenge.summary}</p>
            <p>Suggested duration: {challenge.duration_label}</p>
            <h4>Steps</h4>
            <ol>
              {challenge.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <h4>Safety</h4>
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
        <h2 id="participate-nojs-activities-heading">Hands-on activities</h2>
        {response.activities.map((activity) => (
          <article key={activity.id}>
            <h3>{activity.title}</h3>
            <p>{activity.age_guidance}</p>
            <p>{activity.skill_guidance}</p>
            <p>Suggested duration: {activity.duration_label}</p>
            <h4>Materials</h4>
            <ul>
              {activity.materials.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h4>Steps</h4>
            <ol>
              {activity.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <h4>Safety</h4>
            <ul>
              {activity.safety.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>Learning objective: {activity.learning_objective}</p>
            <p>Expected observation: {activity.expected_observation}</p>
            <p>Cleanup: {activity.cleanup}</p>
            <p>{activity.adult_supervision_note}</p>
            <h4>Limitations</h4>
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
        <h2 id="participate-nojs-sources-heading">Reviewed sources</h2>
        <ul>
          {response.sources.map((source) => (
            <li key={source.id}>
              <a href={source.url} rel="noopener noreferrer" target="_blank">
                {source.title} — {source.organization}
              </a>
              <p>{source.claim_scope}</p>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
