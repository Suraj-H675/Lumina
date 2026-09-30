import type { LaunchItemResponse } from "@nova-lumina/api-client";
import Link from "next/link";

import { ContinueLearningCard } from "../components/continue-learning-card";
import type { ReviewedDiscovery } from "../lib/discoveries/content";
import type { MissionControlMessages } from "../lib/i18n/messages/types";
import { loadLearningContent } from "../lib/learning/content";
import type { NowLaunchesOutcome } from "../lib/server/space-now";
import styles from "./mission-control-home.module.css";

export function MissionControlHome({
  discoveries,
  launchOutcome,
  messages,
}: Readonly<{
  discoveries: ReadonlyArray<ReviewedDiscovery>;
  launchOutcome: NowLaunchesOutcome;
  messages: MissionControlMessages;
}>) {
  const content = loadLearningContent();
  const currentLaunch =
    launchOutcome.kind === "ok" &&
    launchOutcome.data.availability !== "unavailable" &&
    launchOutcome.data.launches.length > 0
      ? (launchOutcome.data.launches[0] ?? null)
      : null;
  const activeLaunches =
    launchOutcome.kind === "ok" && launchOutcome.data.availability !== "unavailable"
      ? launchOutcome.data.active_mission_launch_ids
          .map((launchId) =>
            launchOutcome.data.launches.find((launch) => launch.launch_id === launchId),
          )
          .filter((launch): launch is LaunchItemResponse => launch !== undefined)
      : [];
  const latestDiscovery = discoveries[0] ?? null;

  return (
    <article className={styles.home}>
      <section aria-labelledby="mission-control-title" className={styles.portal}>
        <div className={styles.portalCopy}>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title} id="mission-control-title">
            {messages.title}
          </h1>
          <p className={styles.intro}>{messages.intro}</p>
          <nav aria-label={messages.pathwaysAriaLabel} className={styles.pathways}>
            <Link className={styles.pathway} href="/explore">
              <span aria-hidden="true" className={styles.pathwayIndex}>
                01
              </span>
              <span>{messages.exploreCatalogue}</span>
              <span aria-hidden="true" className={styles.pathwayArrow}>
                →
              </span>
            </Link>
            <Link className={styles.pathway} href="/observe">
              <span aria-hidden="true" className={styles.pathwayIndex}>
                02
              </span>
              <span>{messages.planObservation}</span>
              <span aria-hidden="true" className={styles.pathwayArrow}>
                →
              </span>
            </Link>
            <Link className={styles.pathway} href="/lab">
              <span aria-hidden="true" className={styles.pathwayIndex}>
                03
              </span>
              <span>{messages.openSpaceLab}</span>
              <span aria-hidden="true" className={styles.pathwayArrow}>
                →
              </span>
            </Link>
          </nav>
          <div className={styles.utilityLinks}>
            <Link className={styles.utilityLink} href="/now/launches">
              {messages.openLaunchCenter}
            </Link>
            <Link className={styles.utilityLink} href="/now/satellites">
              {messages.findSatellitePasses}
            </Link>
            <Link className={styles.utilityLink} href="/status">
              {messages.checkSourceStatus}
            </Link>
          </div>
        </div>
        <CurrentMissionEvent
          launch={currentLaunch}
          messages={messages.currentMissionEvent}
          outcome={launchOutcome}
        />
      </section>
      <div className={styles.stream}>
        <MissionBoard
          launches={activeLaunches}
          messages={messages.missionBoard}
          outcome={launchOutcome}
        />
        <ReviewedDiscoveryCard discovery={latestDiscovery} messages={messages.reviewedDiscovery} />
      </div>
      <div className={styles.learningBand}>
        <ContinueLearningCard
          content={content}
          messages={messages.continueLearning}
          path={content.path}
        />
      </div>
      <section aria-labelledby="about-heading" className={styles.about} id="about">
        <h2 id="about-heading">{messages.aboutTitle}</h2>
        <p>{messages.aboutBody}</p>
      </section>
    </article>
  );
}

function CurrentMissionEvent({
  launch,
  messages,
  outcome,
}: Readonly<{
  launch: LaunchItemResponse | null;
  messages: MissionControlMessages["currentMissionEvent"];
  outcome: NowLaunchesOutcome;
}>) {
  if (launch === null) {
    return (
      <section
        aria-labelledby="current-event-heading"
        className={`${styles.event} ${styles.eventUnavailable}`}
        role="status"
      >
        <div className={styles.eventHeader}>
          <p className={styles.eventLabel}>{messages.title}</p>
          <h2 className={styles.eventTitle} id="current-event-heading">
            {messages.title}
          </h2>
        </div>
        <p className={styles.eventBody}>
          {outcome.kind === "ok" && outcome.data.unavailable_reason === "provider_disabled"
            ? messages.providerDisabled
            : messages.unavailable}
        </p>
        <Link className={styles.eventAction} href="/now/launches">
          {messages.openLaunchCenter}
        </Link>
      </section>
    );
  }
  const availability = outcome.kind === "ok" ? outcome.data.availability : "unavailable";
  return (
    <section aria-labelledby="current-event-heading" className={styles.event}>
      <div className={styles.eventHeader}>
        <p className={styles.eventLabel}>
          {messages.title} · {availability}
        </p>
        <h2 className={styles.eventTitle} id="current-event-heading">
          {launch.name}
        </h2>
        <p className={styles.eventStatus}>
          {launch.status.abbreviation} · {launch.status.name}
        </p>
      </div>
      <div className={styles.timing}>
        <p>
          {launch.timing.precision_id <= 2
            ? `${messages.scheduledNetLabel}: `
            : `${messages.scheduleReferenceLabel}: `}
          {launch.timing.precision_id <= 2 ? (
            <time dateTime={launch.timing.net_utc}>{launch.timing.net_utc}</time>
          ) : (
            launch.timing.net_utc.slice(0, 10)
          )}
        </p>
        <p className={styles.timingDetail}>
          {messages.sourcePrecisionLabel}: {launch.timing.precision_name}.{" "}
          {launch.timing.countdown_eligible
            ? messages.countdownEligibleExplanation
            : messages.countdownIneligibleExplanation}
        </p>
      </div>
      <dl className={styles.facts}>
        <HomeFact
          label={messages.missionLabel}
          value={launch.mission?.name ?? messages.missingValue}
        />
        <HomeFact
          label={messages.vehicleLabel}
          value={launch.vehicle?.full_name ?? messages.missingValue}
        />
        <HomeFact
          label={messages.launchProviderLabel}
          value={launch.agency?.name ?? messages.missingValue}
        />
        <HomeFact
          label={messages.siteLabel}
          value={launch.site?.pad_name ?? messages.missingValue}
        />
      </dl>
      <Link className={styles.eventAction} href={`/now/launches/${launch.launch_id}`}>
        {messages.inspectLaunch}
      </Link>
    </section>
  );
}
function MissionBoard({
  launches,
  messages,
  outcome,
}: Readonly<{
  launches: ReadonlyArray<LaunchItemResponse>;
  messages: MissionControlMessages["missionBoard"];
  outcome: NowLaunchesOutcome;
}>) {
  return (
    <section aria-labelledby="mission-board-heading" className={styles.board}>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionEyebrow}>{messages.title}</p>
        <h2 className={styles.sectionTitle} id="mission-board-heading">
          {messages.title}
        </h2>
        <p className={styles.sectionIntro}>{messages.description}</p>
      </div>
      {launches.length === 0 ? (
        <p className={styles.boardEmpty} role="status">
          {outcome.kind === "ok" && outcome.data.availability !== "unavailable"
            ? messages.emptyCurrent
            : messages.unavailable}
        </p>
      ) : (
        <div className={styles.boardList}>
          {launches.map((launch) => (
            <article className={styles.boardEntry} key={launch.launch_id}>
              <p className={styles.boardMeta}>
                {launch.status.abbreviation} · {launch.timing.precision_name}
              </p>
              <div>
                <h3 className={styles.boardName}>
                  <Link href={`/now/launches/${launch.launch_id}`}>
                    {launch.mission?.name ?? launch.name}
                  </Link>
                </h3>
                <p className={styles.boardDetail}>
                  {launch.vehicle?.full_name ?? messages.vehicleMissing} ·{" "}
                  {launch.site?.location_name ?? launch.site?.pad_name ?? messages.siteMissing}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function ReviewedDiscoveryCard({
  discovery,
  messages,
}: Readonly<{
  discovery: ReviewedDiscovery | null;
  messages: MissionControlMessages["reviewedDiscovery"];
}>) {
  if (discovery === null) return null;
  return (
    <section aria-labelledby="reviewed-discovery-heading" className={styles.discovery}>
      <div className={styles.discoveryMeta}>
        <p className={styles.sectionEyebrow}>
          {messages.eyebrow} · {discovery.content_type}
        </p>
        <p className={styles.published}>
          {messages.publishedLabel} {discovery.publication_date}
        </p>
      </div>
      <div className={styles.discoveryBody}>
        <h2 className={styles.discoveryTitle} id="reviewed-discovery-heading">
          {discovery.title}
        </h2>
        <p className={styles.discoverySummary}>{discovery.summary}</p>
        <div className={styles.why}>
          <h3>{messages.whyItMattersTitle}</h3>
          <p>{discovery.why_it_matters}</p>
        </div>
        <p className={styles.confirmation}>
          {messages.confirmationStateLabel}:{" "}
          {discovery.independent_confirmation_state.replaceAll("-", " ")}.
        </p>
        <Link className={styles.discoveryLink} href="/discoveries">
          {messages.seeAll}
        </Link>
      </div>
    </section>
  );
}

function HomeFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
