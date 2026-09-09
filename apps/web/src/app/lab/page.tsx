import Link from "next/link";

const labs = [
  {
    href: "/lab/scale-explorer",
    title: "Scale Explorer",
    description: "Move through a cited logarithmic scale of astronomical characteristic sizes.",
  },
  {
    href: "/lab/seasons-simulator",
    title: "Seasons Simulator",
    description:
      "Explore idealized axial-tilt solar geometry and separate orbital-distance context.",
  },
  {
    href: "/lab/telescope-builder",
    title: "Telescope Builder",
    description:
      "Explore idealized visual telescope, eyepiece, focal-modifier, field, and exit-pupil geometry.",
  },
  {
    href: "/lab/hr-diagram-explorer",
    title: "H-R Diagram Explorer",
    description:
      "Explore a curated Gaia DR3 stellar sample across physical H-R and Gaia colour–magnitude views.",
  },
] as const;

export const metadata = {
  alternates: {
    canonical: "/lab",
  },
  title: "Lab",
  description: "Lumina's implemented interactive astronomy laboratories.",
};

export default function LabPage() {
  return (
    <article className="space-y-10">
      <header className="max-w-3xl space-y-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Space Lab
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Lab</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          Open a reviewed Lumina laboratory. Each lab keeps its model, assumptions, and accessible
          text result visible alongside its interaction.
        </p>
      </header>

      <nav aria-label="Implemented laboratories">
        <ul className="m-0 grid list-none gap-5 p-0 md:grid-cols-2 xl:grid-cols-4">
          {labs.map((lab) => (
            <li className="flex" key={lab.href}>
              <Link
                className="flex min-h-44 w-full flex-col justify-between rounded-md border border-[var(--border)] bg-[var(--surface)] p-5 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                href={lab.href}
              >
                <span>
                  <span className="block text-xl font-semibold text-[var(--foreground)]">
                    {lab.title}
                  </span>
                  <span className="mt-3 block leading-7 text-[var(--muted)]">
                    {lab.description}
                  </span>
                </span>
                <span className="mt-5 font-semibold text-[var(--link)] underline">Open lab →</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
