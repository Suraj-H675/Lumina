import type { LearningSource } from "../lib/learning/content";

type LearningSourcesProps = Readonly<{
  reviewedAt: string;
  reviewedBy: ReadonlyArray<string>;
  sources: ReadonlyArray<LearningSource>;
  version: number;
}>;

function reviewDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

export function LearningSources({
  reviewedAt,
  reviewedBy,
  sources,
  version,
}: LearningSourcesProps) {
  return (
    <section
      aria-labelledby="learning-sources-heading"
      className="space-y-4 border-t border-[var(--border)] pt-8"
    >
      <div className="space-y-2">
        <h2 id="learning-sources-heading">Sources and review</h2>
        <p className="leading-7 text-[var(--muted)]">
          Authored content · version {version} · reviewed {reviewDate(reviewedAt)} by{" "}
          {reviewedBy.join(", ")}.
        </p>
      </div>
      <ol aria-label="Learning content sources" className="m-0 grid list-decimal gap-3 pl-6">
        {sources.map((source) => (
          <li className="pl-2" key={source.id}>
            <a className="font-medium text-[var(--link)] underline" href={source.url_or_doi}>
              {source.title}
            </a>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {source.organization_or_authors} · {source.claim_scope} Accessed{" "}
              {reviewDate(source.accessed_at)}.
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
