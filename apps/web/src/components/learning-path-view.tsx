import Link from "next/link";

import type { LearningContent, LearningPath } from "../lib/learning/content";
import { getSourcesForIds } from "../lib/learning/content";

import { LearningPathLessonList } from "./learning-path-lesson-list";
import { LearningSources } from "./learning-sources";

type LearningPathViewProps = Readonly<{
  content: LearningContent;
  path: LearningPath;
}>;

export function LearningPathView({ content, path }: LearningPathViewProps) {
  return (
    <article className="space-y-12">
      <nav aria-label="Breadcrumb">
        <ol className="m-0 flex list-none flex-wrap gap-2 p-0 text-sm text-[var(--muted)]">
          <li>
            <Link className="text-[var(--link)] underline" href="/learn">
              Learn
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{path.title}</li>
        </ol>
      </nav>
      <header className="max-w-3xl space-y-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Learning path
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{path.title}</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{path.summary}</p>
        <p className="text-sm text-[var(--muted)]">
          {path.lesson_slugs.length} lessons · quizzes included · no account required
        </p>
      </header>
      <section aria-labelledby="path-objectives-heading" className="max-w-3xl space-y-4">
        <h2 id="path-objectives-heading">What you will practise</h2>
        <ul className="m-0 grid list-disc gap-2 pl-6 leading-7 text-[var(--muted)]">
          {path.learning_objectives.map((objective) => (
            <li key={objective}>{objective}</li>
          ))}
        </ul>
      </section>
      <LearningPathLessonList content={content} path={path} />
      <section
        aria-labelledby="path-capstone-heading"
        className="max-w-3xl space-y-4 border-t border-[var(--border)] pt-8"
      >
        <h2 id="path-capstone-heading">Capstone: {path.capstone_activity.title}</h2>
        <p className="leading-7 text-[var(--muted)]">
          Finish by making a short, private note about a real observation. You do not need to
          identify everything; the note should preserve what you saw and what stayed unknown.
        </p>
        <ol className="m-0 grid list-decimal gap-2 pl-6 leading-7 text-[var(--muted)]">
          {path.capstone_activity.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-4 text-sm leading-6 text-[var(--muted)]">
          <strong className="text-[var(--foreground)]">Safety:</strong>{" "}
          {path.capstone_activity.safety}
        </p>
      </section>
      <LearningSources
        reviewedAt={path.reviewed_at}
        reviewedBy={path.reviewed_by}
        sources={getSourcesForIds(content, path.source_ids)}
        version={path.version}
      />
    </article>
  );
}
