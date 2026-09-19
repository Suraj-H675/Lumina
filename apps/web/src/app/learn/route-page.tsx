import type { Metadata } from "next";
import Link from "next/link";

import { LearningProgressControls } from "../../components/learning-progress-controls";
import { loadLearningContent } from "../../lib/learning/content";

export const metadata: Metadata = {
  title: "Learn",
  description: "Follow Lumina's authored, source-backed learning path for a first night sky.",
};

export default function LearnPage() {
  const content = loadLearningContent();
  const path = content.path;

  return (
    <article className="space-y-12">
      <header className="max-w-3xl space-y-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Learn
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Understand the sky by looking up
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Lumina&apos;s learning content is authored, reviewed, and source-backed. Start with one
          complete path designed to help you make a real first observation.
        </p>
      </header>
      <section
        aria-labelledby="available-path-heading"
        className="max-w-3xl space-y-4 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-6 py-6"
      >
        <p className="text-sm font-semibold text-[var(--accent)]">Complete learning path</p>
        <h2 id="available-path-heading">{path.title}</h2>
        <p className="leading-7 text-[var(--muted)]">{path.summary}</p>
        <p className="text-sm text-[var(--muted)]">
          {path.lesson_slugs.length} lessons · authored mode variants · deterministic quizzes
        </p>
        <Link
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 font-semibold text-[var(--foreground)] no-underline hover:border-[var(--accent)]"
          href={`/learn/${path.slug}`}
        >
          View the path
        </Link>
      </section>
      <LearningProgressControls />
    </article>
  );
}
