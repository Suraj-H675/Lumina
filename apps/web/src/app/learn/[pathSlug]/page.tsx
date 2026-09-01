import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LearningPathView } from "../../../components/learning-path-view";
import { loadLearningContent } from "../../../lib/learning/content";

type LearningPathPageProps = Readonly<{
  params: Promise<{ pathSlug: string }>;
}>;

export const metadata: Metadata = {
  title: "Your First Night Sky",
  description: "A complete authored learning path for making a first night-sky observation.",
};

export function generateStaticParams(): Array<{ pathSlug: string }> {
  return [{ pathSlug: loadLearningContent().path.slug }];
}

export default async function LearningPathPage({ params }: LearningPathPageProps) {
  const { pathSlug } = await params;
  const content = loadLearningContent();
  if (content.path.slug !== pathSlug) notFound();
  return <LearningPathView content={content} path={content.path} />;
}
