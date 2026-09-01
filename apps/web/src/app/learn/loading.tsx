export default function LearningLoading() {
  return (
    <div className="space-y-4" role="status">
      <p className="text-sm text-[var(--muted)]">The learning path is loading…</p>
      <div
        aria-hidden="true"
        className="h-10 max-w-2xl animate-pulse rounded-md bg-[var(--surface)] motion-reduce:animate-none"
      />
    </div>
  );
}
