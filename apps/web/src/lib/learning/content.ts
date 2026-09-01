import rawLearningContent from "../../content/learning/your-first-night-sky.json";

export const LEARNING_CONTENT_SCHEMA_VERSION = 1 as const;
export const LEARNING_PATH_SLUG = "your-first-night-sky" as const;

export const AUDIENCE_MODES = ["explorer", "student", "deep-dive"] as const;
export type AudienceMode = (typeof AUDIENCE_MODES)[number];

export type LearningStatus =
  | "draft"
  | "science-review"
  | "editorial-review"
  | "ready"
  | "published"
  | "needs-update"
  | "archived";

export type LearningSource = {
  id: string;
  title: string;
  organization_or_authors: string;
  url_or_doi: string;
  publication_date: string | null;
  accessed_at: string;
  claim_scope: string;
  source_type: "official-agency" | "official-education" | "professional-organization";
};

export type LearningModeVariant = {
  label: string;
  explanation: string;
  deeper_question: string;
};

export type LearningSection = {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets: string[];
};

export type LearningObjectExample = {
  name: string;
  why_it_helps: string;
  source_ids: string[];
};

export type LearningMisconception = {
  prompt: string;
  misconception: string;
  correction: string;
  source_ids: string[];
};

export type LearningActivity = {
  title: string;
  materials: string[];
  duration_minutes: number;
  steps: string[];
  safety: string;
  expected_observation: string;
};

export type LearningNextAction = {
  label: string;
  href: string;
};

export type LearningLesson = {
  id: string;
  slug: string;
  title: string;
  content_type: "lesson";
  language: "en";
  status: LearningStatus;
  version: number;
  summary: string;
  audience_modes: AudienceMode[];
  learning_objectives: string[];
  prerequisites: string[];
  source_ids: string[];
  reviewed_by: string[];
  reviewed_at: string;
  updated_at: string;
  hook: string;
  estimated_minutes: number;
  mode_variants: Record<AudienceMode, LearningModeVariant>;
  sections: LearningSection[];
  interactive_references: LearningNextAction[];
  real_object_examples: LearningObjectExample[];
  misconception_check: LearningMisconception;
  activity: LearningActivity;
  knowledge_check_ids: string[];
  summary_points: string[];
  next_actions: LearningNextAction[];
};

export type LearningQuizQuestion = {
  id: string;
  type: "single-choice";
  prompt: string;
  choices: Array<{ id: string; label: string }>;
  correct_choice_id: string;
  hint: string;
  feedback_correct: string;
  feedback_incorrect: string;
  explanation: string;
  concept_ids: string[];
  source_ids: string[];
};

export type LearningQuiz = {
  id: string;
  slug: string;
  title: string;
  content_type: "quiz";
  language: "en";
  status: LearningStatus;
  version: number;
  lesson_slug: string;
  source_ids: string[];
  reviewed_by: string[];
  reviewed_at: string;
  updated_at: string;
  questions: LearningQuizQuestion[];
};

export type LearningPath = {
  id: string;
  slug: string;
  title: string;
  content_type: "path";
  language: "en";
  status: LearningStatus;
  version: number;
  summary: string;
  audience_modes: AudienceMode[];
  learning_objectives: string[];
  prerequisites: string[];
  source_ids: string[];
  reviewed_by: string[];
  reviewed_at: string;
  updated_at: string;
  lesson_slugs: string[];
  completion_rule: {
    type: "all-lessons-mastered";
    mastery_threshold: number;
  };
  mastery_concepts: string[];
  capstone_activity: LearningActivity;
};

export type LearningContent = {
  schema_version: 1;
  bundle_id: string;
  path: LearningPath;
  lessons: LearningLesson[];
  quizzes: LearningQuiz[];
  sources: LearningSource[];
};

export class LearningContentValidationError extends Error {
  readonly code = "LEARNING_CONTENT_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "LearningContentValidationError";
  }
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SOURCE_URL_PATTERN = /^https:\/\/[^\s]+$/u;
const PUBLISHED_STATUS: LearningStatus = "published";

function fail(message: string): never {
  throw new LearningContentValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordKeysAreOnly(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0)
    fail(`${field} must be a non-empty string`);
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.trim())) {
    fail(`${field} must be an array of non-empty strings`);
  }
  return value;
}

function slugValue(value: unknown, field: string): string {
  const slug = stringValue(value, field);
  if (!SLUG_PATTERN.test(slug)) fail(`${field} must be a lowercase kebab-case slug`);
  return slug;
}

function timestampValue(value: unknown, field: string): string {
  const timestamp = stringValue(value, field);
  if (!ISO_TIMESTAMP_PATTERN.test(timestamp) || new Date(timestamp).toISOString() !== timestamp) {
    fail(`${field} must be a canonical UTC timestamp`);
  }
  return timestamp;
}

function statusValue(value: unknown, field: string): LearningStatus {
  if (
    value !== "draft" &&
    value !== "science-review" &&
    value !== "editorial-review" &&
    value !== "ready" &&
    value !== "published" &&
    value !== "needs-update" &&
    value !== "archived"
  ) {
    fail(`${field} has an invalid review status`);
  }
  return value;
}

function audienceModes(value: unknown, field: string): AudienceMode[] {
  if (
    !Array.isArray(value) ||
    value.length !== AUDIENCE_MODES.length ||
    new Set(value).size !== AUDIENCE_MODES.length ||
    !value.every((mode) => AUDIENCE_MODES.includes(mode as AudienceMode))
  ) {
    fail(`${field} must contain Explorer, Student, and Deep Dive modes exactly once`);
  }
  return value as AudienceMode[];
}

function sourceIds(value: unknown, field: string, knownSourceIds: ReadonlySet<string>): string[] {
  const ids = stringArray(value, field);
  if (ids.length === 0) fail(`${field} must not be empty for published content`);
  if (ids.some((id) => !knownSourceIds.has(id))) fail(`${field} references an unknown source`);
  return ids;
}

function validateReviewMetadata(
  record: Record<string, unknown>,
  field: string,
  status: LearningStatus,
): { reviewed_by: string[]; reviewed_at: string; updated_at: string } {
  const reviewedBy = stringArray(record.reviewed_by, `${field}.reviewed_by`);
  const reviewedAt = timestampValue(record.reviewed_at, `${field}.reviewed_at`);
  const updatedAt = timestampValue(record.updated_at, `${field}.updated_at`);
  if (status === PUBLISHED_STATUS && reviewedBy.length === 0) {
    fail(`${field} published content must name a reviewer`);
  }
  return { reviewed_by: reviewedBy, reviewed_at: reviewedAt, updated_at: updatedAt };
}

function validateCommonMetadata<ContentType extends "path" | "lesson" | "quiz">(
  record: Record<string, unknown>,
  field: string,
  contentType: ContentType,
): {
  id: string;
  slug: string;
  title: string;
  content_type: ContentType;
  language: "en";
  status: LearningStatus;
  version: number;
  audience_modes: AudienceMode[];
  source_ids: string[];
  reviewed_by: string[];
  reviewed_at: string;
  updated_at: string;
} {
  const status = statusValue(record.status, `${field}.status`);
  const review = validateReviewMetadata(record, field, status);
  if (record.content_type !== contentType) fail(`${field}.content_type must be ${contentType}`);
  if (record.language !== "en") fail(`${field}.language must be en`);
  if (
    typeof record.version !== "number" ||
    !Number.isInteger(record.version) ||
    record.version < 1
  ) {
    fail(`${field}.version must be a positive integer`);
  }
  return {
    id: stringValue(record.id, `${field}.id`),
    slug: slugValue(record.slug, `${field}.slug`),
    title: stringValue(record.title, `${field}.title`),
    content_type: contentType,
    language: "en",
    status,
    version: record.version,
    audience_modes: audienceModes(record.audience_modes, `${field}.audience_modes`),
    source_ids: [],
    ...review,
  };
}

function validateSources(value: unknown): LearningSource[] {
  if (!Array.isArray(value) || value.length === 0)
    fail("published learning content must include at least one source");
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const field = `sources[${index}]`;
    if (!isRecord(entry)) fail(`${field} must be an object`);
    if (
      !recordKeysAreOnly(entry, [
        "accessed_at",
        "claim_scope",
        "id",
        "organization_or_authors",
        "publication_date",
        "source_type",
        "title",
        "url_or_doi",
      ])
    ) {
      fail(`${field} contains an unknown field`);
    }
    const id = slugValue(entry.id, `${field}.id`);
    if (seen.has(id)) fail(`duplicate source id: ${id}`);
    seen.add(id);
    const sourceType = entry.source_type;
    if (
      sourceType !== "official-agency" &&
      sourceType !== "official-education" &&
      sourceType !== "professional-organization"
    ) {
      fail(`${field}.source_type is invalid`);
    }
    const publicationDate = entry.publication_date;
    if (
      publicationDate !== null &&
      (typeof publicationDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(publicationDate))
    ) {
      fail(`${field}.publication_date must be an ISO date or null`);
    }
    const url = stringValue(entry.url_or_doi, `${field}.url_or_doi`);
    if (!SOURCE_URL_PATTERN.test(url)) fail(`${field}.url_or_doi must be an HTTPS URL`);
    return {
      accessed_at: timestampValue(entry.accessed_at, `${field}.accessed_at`),
      claim_scope: stringValue(entry.claim_scope, `${field}.claim_scope`),
      id,
      organization_or_authors: stringValue(
        entry.organization_or_authors,
        `${field}.organization_or_authors`,
      ),
      publication_date: publicationDate,
      source_type: sourceType,
      title: stringValue(entry.title, `${field}.title`),
      url_or_doi: url,
    };
  });
}

function validateNoBlockingMarkers(value: unknown, field: string): void {
  if (typeof value === "string" && /TODO|FIXME|decision-required|\bTBD\b/iu.test(value)) {
    fail(`${field} contains an unresolved publication marker`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateNoBlockingMarkers(entry, `${field}[${index}]`));
  } else if (isRecord(value)) {
    Object.entries(value).forEach(([key, entry]) =>
      validateNoBlockingMarkers(entry, `${field}.${key}`),
    );
  }
}

function validateModeVariants(
  value: unknown,
  field: string,
): Record<AudienceMode, LearningModeVariant> {
  if (!isRecord(value) || !recordKeysAreOnly(value, AUDIENCE_MODES)) {
    fail(`${field} must author every presentation mode`);
  }
  const variants = {} as Record<AudienceMode, LearningModeVariant>;
  for (const mode of AUDIENCE_MODES) {
    const variant = value[mode];
    if (
      !isRecord(variant) ||
      !recordKeysAreOnly(variant, ["deeper_question", "explanation", "label"])
    ) {
      fail(`${field}.${mode} is incomplete`);
    }
    variants[mode] = {
      deeper_question: stringValue(variant.deeper_question, `${field}.${mode}.deeper_question`),
      explanation: stringValue(variant.explanation, `${field}.${mode}.explanation`),
      label: stringValue(variant.label, `${field}.${mode}.label`),
    };
  }
  return variants;
}

function validateNextActions(value: unknown, field: string): LearningNextAction[] {
  if (!Array.isArray(value)) fail(`${field} must be an array`);
  return value.map((entry, index) => {
    const itemField = `${field}[${index}]`;
    if (!isRecord(entry) || !recordKeysAreOnly(entry, ["href", "label"])) {
      fail(`${itemField} is invalid`);
    }
    const href = stringValue(entry.href, `${itemField}.href`);
    if (!href.startsWith("/")) fail(`${itemField}.href must be an internal path`);
    return { href, label: stringValue(entry.label, `${itemField}.label`) };
  });
}

function validateActivity(value: unknown, field: string): LearningActivity {
  if (
    !isRecord(value) ||
    !recordKeysAreOnly(value, [
      "duration_minutes",
      "expected_observation",
      "materials",
      "safety",
      "steps",
      "title",
    ])
  ) {
    fail(`${field} is invalid`);
  }
  if (
    typeof value.duration_minutes !== "number" ||
    !Number.isInteger(value.duration_minutes) ||
    value.duration_minutes <= 0
  ) {
    fail(`${field}.duration_minutes must be a positive integer`);
  }
  const steps = stringArray(value.steps, `${field}.steps`);
  if (steps.length < 2) fail(`${field}.steps must contain at least two steps`);
  return {
    duration_minutes: value.duration_minutes,
    expected_observation: stringValue(value.expected_observation, `${field}.expected_observation`),
    materials: stringArray(value.materials, `${field}.materials`),
    safety: stringValue(value.safety, `${field}.safety`),
    steps,
    title: stringValue(value.title, `${field}.title`),
  };
}

function validateLessons(value: unknown, knownSourceIds: ReadonlySet<string>): LearningLesson[] {
  if (!Array.isArray(value) || value.length === 0) fail("learning path must contain lessons");
  return value.map((entry, index) => {
    const field = `lessons[${index}]`;
    if (!isRecord(entry)) fail(`${field} must be an object`);
    const metadata = validateCommonMetadata(entry, field, "lesson");
    const lessonSourceIds = sourceIdsForRecord(entry, field, knownSourceIds);
    if (
      !recordKeysAreOnly(entry, [
        "activity",
        "audience_modes",
        "content_type",
        "estimated_minutes",
        "hook",
        "id",
        "interactive_references",
        "knowledge_check_ids",
        "language",
        "learning_objectives",
        "misconception_check",
        "mode_variants",
        "next_actions",
        "prerequisites",
        "real_object_examples",
        "reviewed_at",
        "reviewed_by",
        "sections",
        "slug",
        "source_ids",
        "status",
        "summary",
        "summary_points",
        "title",
        "updated_at",
        "version",
      ])
    ) {
      fail(`${field} contains an unknown field`);
    }
    if (
      typeof entry.estimated_minutes !== "number" ||
      !Number.isInteger(entry.estimated_minutes) ||
      entry.estimated_minutes <= 0
    ) {
      fail(`${field}.estimated_minutes must be a positive integer`);
    }
    if (!Array.isArray(entry.sections) || entry.sections.length === 0)
      fail(`${field}.sections must not be empty`);
    const sections = entry.sections.map((section, sectionIndex) => {
      const sectionField = `${field}.sections[${sectionIndex}]`;
      if (
        !isRecord(section) ||
        !recordKeysAreOnly(section, ["bullets", "heading", "id", "paragraphs"])
      ) {
        fail(`${sectionField} is invalid`);
      }
      return {
        bullets: stringArray(section.bullets, `${sectionField}.bullets`),
        heading: stringValue(section.heading, `${sectionField}.heading`),
        id: slugValue(section.id, `${sectionField}.id`),
        paragraphs: stringArray(section.paragraphs, `${sectionField}.paragraphs`),
      };
    });
    const misconception = entry.misconception_check;
    if (
      !isRecord(misconception) ||
      !recordKeysAreOnly(misconception, ["correction", "misconception", "prompt", "source_ids"])
    ) {
      fail(`${field}.misconception_check is invalid`);
    }
    const realObjectExamples = entry.real_object_examples;
    if (!Array.isArray(realObjectExamples) || realObjectExamples.length === 0) {
      fail(`${field}.real_object_examples must not be empty`);
    }
    const objectExamples = realObjectExamples.map((example, exampleIndex) => {
      const exampleField = `${field}.real_object_examples[${exampleIndex}]`;
      if (
        !isRecord(example) ||
        !recordKeysAreOnly(example, ["name", "source_ids", "why_it_helps"])
      ) {
        fail(`${exampleField} is invalid`);
      }
      return {
        name: stringValue(example.name, `${exampleField}.name`),
        source_ids: sourceIds(example.source_ids, `${exampleField}.source_ids`, knownSourceIds),
        why_it_helps: stringValue(example.why_it_helps, `${exampleField}.why_it_helps`),
      };
    });
    return {
      ...metadata,
      activity: validateActivity(entry.activity, `${field}.activity`),
      hook: stringValue(entry.hook, `${field}.hook`),
      estimated_minutes: entry.estimated_minutes,
      mode_variants: validateModeVariants(entry.mode_variants, `${field}.mode_variants`),
      sections,
      interactive_references: validateNextActions(
        entry.interactive_references,
        `${field}.interactive_references`,
      ),
      real_object_examples: objectExamples,
      misconception_check: {
        correction: stringValue(
          misconception.correction,
          `${field}.misconception_check.correction`,
        ),
        misconception: stringValue(
          misconception.misconception,
          `${field}.misconception_check.misconception`,
        ),
        prompt: stringValue(misconception.prompt, `${field}.misconception_check.prompt`),
        source_ids: sourceIds(
          misconception.source_ids,
          `${field}.misconception_check.source_ids`,
          knownSourceIds,
        ),
      },
      knowledge_check_ids: stringArray(entry.knowledge_check_ids, `${field}.knowledge_check_ids`),
      learning_objectives: stringArray(entry.learning_objectives, `${field}.learning_objectives`),
      next_actions: validateNextActions(entry.next_actions, `${field}.next_actions`),
      prerequisites: stringArray(entry.prerequisites, `${field}.prerequisites`),
      summary: stringValue(entry.summary, `${field}.summary`),
      summary_points: stringArray(entry.summary_points, `${field}.summary_points`),
      source_ids: lessonSourceIds,
    };
  });
}

function sourceIdsForRecord(
  record: Record<string, unknown>,
  field: string,
  knownSourceIds: ReadonlySet<string>,
): string[] {
  return sourceIds(record.source_ids, `${field}.source_ids`, knownSourceIds);
}

function validateQuizzes(value: unknown, knownSourceIds: ReadonlySet<string>): LearningQuiz[] {
  if (!Array.isArray(value) || value.length === 0) fail("learning path must contain quizzes");
  return value.map((entry, index) => {
    const field = `quizzes[${index}]`;
    if (!isRecord(entry)) fail(`${field} must be an object`);
    const metadata = validateCommonMetadata(entry, field, "quiz");
    const quizSourceIds = sourceIdsForRecord(entry, field, knownSourceIds);
    if (
      !recordKeysAreOnly(entry, [
        "audience_modes",
        "content_type",
        "id",
        "language",
        "lesson_slug",
        "questions",
        "reviewed_at",
        "reviewed_by",
        "slug",
        "source_ids",
        "status",
        "title",
        "updated_at",
        "version",
      ])
    ) {
      fail(`${field} contains an unknown field`);
    }
    if (!Array.isArray(entry.questions) || entry.questions.length === 0)
      fail(`${field}.questions must not be empty`);
    const questions = entry.questions.map((question, questionIndex) => {
      const questionField = `${field}.questions[${questionIndex}]`;
      if (
        !isRecord(question) ||
        !recordKeysAreOnly(question, [
          "choices",
          "concept_ids",
          "correct_choice_id",
          "explanation",
          "feedback_correct",
          "feedback_incorrect",
          "hint",
          "id",
          "prompt",
          "source_ids",
          "type",
        ])
      ) {
        fail(`${questionField} is invalid`);
      }
      if (question.type !== "single-choice") fail(`${questionField}.type is not supported`);
      const choices = question.choices;
      if (
        !Array.isArray(choices) ||
        choices.length < 2 ||
        !choices.every(
          (choice) =>
            isRecord(choice) &&
            recordKeysAreOnly(choice, ["id", "label"]) &&
            typeof choice.id === "string" &&
            typeof choice.label === "string",
        )
      ) {
        fail(`${questionField}.choices must contain at least two valid choices`);
      }
      const choiceIds = choices.map((choice) => choice.id as string);
      if (new Set(choiceIds).size !== choiceIds.length)
        fail(`${questionField} has duplicate choice ids`);
      if (
        typeof question.correct_choice_id !== "string" ||
        !choiceIds.includes(question.correct_choice_id)
      ) {
        fail(`${questionField} correct choice is missing from choices`);
      }
      return {
        choices: choices.map((choice) => ({
          id: choice.id as string,
          label: choice.label as string,
        })),
        concept_ids: stringArray(question.concept_ids, `${questionField}.concept_ids`),
        correct_choice_id: question.correct_choice_id,
        explanation: stringValue(question.explanation, `${questionField}.explanation`),
        feedback_correct: stringValue(
          question.feedback_correct,
          `${questionField}.feedback_correct`,
        ),
        feedback_incorrect: stringValue(
          question.feedback_incorrect,
          `${questionField}.feedback_incorrect`,
        ),
        hint: stringValue(question.hint, `${questionField}.hint`),
        id: slugValue(question.id, `${questionField}.id`),
        prompt: stringValue(question.prompt, `${questionField}.prompt`),
        source_ids: sourceIds(question.source_ids, `${questionField}.source_ids`, knownSourceIds),
        type: "single-choice" as const,
      };
    });
    const questionIds = questions.map((question) => question.id);
    if (new Set(questionIds).size !== questionIds.length)
      fail(`${field} has duplicate question ids`);
    return {
      ...metadata,
      lesson_slug: slugValue(entry.lesson_slug, `${field}.lesson_slug`),
      questions,
      slug: slugValue(entry.slug, `${field}.slug`),
      source_ids: quizSourceIds,
    };
  });
}

function validatePath(value: unknown, knownSourceIds: ReadonlySet<string>): LearningPath {
  if (!isRecord(value)) fail("learning path must be an object");
  const metadata = validateCommonMetadata(value, "path", "path");
  if (
    !recordKeysAreOnly(value, [
      "audience_modes",
      "capstone_activity",
      "completion_rule",
      "content_type",
      "id",
      "language",
      "learning_objectives",
      "lesson_slugs",
      "mastery_concepts",
      "prerequisites",
      "reviewed_at",
      "reviewed_by",
      "slug",
      "source_ids",
      "status",
      "summary",
      "title",
      "updated_at",
      "version",
    ])
  ) {
    fail("path contains an unknown field");
  }
  if (
    !isRecord(value.completion_rule) ||
    !recordKeysAreOnly(value.completion_rule, ["mastery_threshold", "type"])
  ) {
    fail("path.completion_rule is invalid");
  }
  if (value.completion_rule.type !== "all-lessons-mastered")
    fail("path.completion_rule.type is invalid");
  if (
    typeof value.completion_rule.mastery_threshold !== "number" ||
    value.completion_rule.mastery_threshold < 0 ||
    value.completion_rule.mastery_threshold > 1
  ) {
    fail("path.completion_rule.mastery_threshold must be between 0 and 1");
  }
  return {
    ...metadata,
    capstone_activity: validateActivity(value.capstone_activity, "path.capstone_activity"),
    completion_rule: {
      mastery_threshold: value.completion_rule.mastery_threshold,
      type: "all-lessons-mastered",
    },
    learning_objectives: stringArray(value.learning_objectives, "path.learning_objectives"),
    lesson_slugs: stringArray(value.lesson_slugs, "path.lesson_slugs"),
    mastery_concepts: stringArray(value.mastery_concepts, "path.mastery_concepts"),
    prerequisites: stringArray(value.prerequisites, "path.prerequisites"),
    slug: slugValue(value.slug, "path.slug"),
    source_ids: sourceIds(value.source_ids, "path.source_ids", knownSourceIds),
    summary: stringValue(value.summary, "path.summary"),
    title: stringValue(value.title, "path.title"),
  };
}

function assertCrossReferences(content: LearningContent): void {
  if (content.path.slug !== LEARNING_PATH_SLUG)
    fail(`only ${LEARNING_PATH_SLUG} is published in this bundle`);
  const lessonBySlug = new Map(content.lessons.map((lesson) => [lesson.slug, lesson]));
  const quizById = new Map(content.quizzes.map((quiz) => [quiz.id, quiz]));
  const quizBySlug = new Map(content.quizzes.map((quiz) => [quiz.slug, quiz]));
  if (new Set(content.lessons.map((lesson) => lesson.slug)).size !== content.lessons.length) {
    fail("learning lessons must have unique slugs");
  }
  if (new Set(content.lessons.map((lesson) => lesson.id)).size !== content.lessons.length) {
    fail("learning lessons must have unique ids");
  }
  if (new Set(content.quizzes.map((quiz) => quiz.id)).size !== content.quizzes.length) {
    fail("learning quizzes must have unique ids");
  }
  if (new Set(content.quizzes.map((quiz) => quiz.slug)).size !== content.quizzes.length) {
    fail("learning quizzes must have unique slugs");
  }
  if (
    content.path.lesson_slugs.length !== content.lessons.length ||
    new Set(content.path.lesson_slugs).size !== content.path.lesson_slugs.length ||
    content.path.lesson_slugs.some((slug) => !lessonBySlug.has(slug))
  ) {
    fail("path lesson order must reference every lesson exactly once");
  }
  const lessonIndex = new Map(content.path.lesson_slugs.map((slug, index) => [slug, index]));
  for (const lesson of content.lessons) {
    for (const prerequisite of lesson.prerequisites) {
      if (!lessonBySlug.has(prerequisite))
        fail(`lesson ${lesson.slug} references an unknown prerequisite`);
      if (prerequisite === lesson.slug) fail("learning prerequisite cycle detected");
    }
    if (lesson.knowledge_check_ids.some((quizId) => !quizById.has(quizId))) {
      fail(`lesson ${lesson.slug} references an unknown knowledge check`);
    }
    for (const quizId of lesson.knowledge_check_ids) {
      const quiz = quizById.get(quizId);
      if (quiz?.lesson_slug !== lesson.slug) fail(`quiz ${quizId} points to the wrong lesson`);
    }
  }
  // A topological walk gives a bounded, deterministic cycle check for all lesson prerequisites.
  for (const lesson of content.lessons) {
    const visiting = new Set<string>();
    const visit = (slug: string): void => {
      if (visiting.has(slug)) fail("learning prerequisite cycle detected");
      visiting.add(slug);
      const current = lessonBySlug.get(slug);
      current?.prerequisites.forEach(visit);
      visiting.delete(slug);
    };
    visit(lesson.slug);
  }
  for (const quiz of content.quizzes) {
    if (!lessonBySlug.has(quiz.lesson_slug)) fail(`quiz ${quiz.slug} references an unknown lesson`);
    if (!quizBySlug.has(quiz.slug)) fail(`quiz ${quiz.slug} has an invalid slug index`);
  }
  for (let index = 1; index < content.path.lesson_slugs.length; index += 1) {
    const lessonSlug = content.path.lesson_slugs[index];
    if (lessonSlug === undefined) fail("path lesson order is invalid");
    const lesson = lessonBySlug.get(lessonSlug);
    if (lesson === undefined) fail("path lesson order is invalid");
    for (const prerequisite of lesson.prerequisites) {
      const prerequisiteIndex = lessonIndex.get(prerequisite);
      if (prerequisiteIndex === undefined || prerequisiteIndex >= index) {
        fail(`lesson ${lesson.slug} prerequisite must appear earlier in the path`);
      }
    }
  }
}

export function validateLearningContent(value: unknown): LearningContent {
  if (
    !isRecord(value) ||
    !recordKeysAreOnly(value, [
      "bundle_id",
      "lessons",
      "path",
      "quizzes",
      "schema_version",
      "sources",
    ])
  ) {
    fail("learning content bundle has an invalid envelope");
  }
  if (value.schema_version !== LEARNING_CONTENT_SCHEMA_VERSION)
    fail("learning content schema version is unsupported");
  const sources = validateSources(value.sources);
  const knownSourceIds = new Set(sources.map((source) => source.id));
  const content: LearningContent = {
    bundle_id: slugValue(value.bundle_id, "bundle_id"),
    lessons: validateLessons(value.lessons, knownSourceIds),
    path: validatePath(value.path, knownSourceIds),
    quizzes: validateQuizzes(value.quizzes, knownSourceIds),
    schema_version: LEARNING_CONTENT_SCHEMA_VERSION,
    sources,
  };
  assertCrossReferences(content);
  if (content.path.status === PUBLISHED_STATUS) {
    if (content.lessons.some((lesson) => lesson.status !== PUBLISHED_STATUS)) {
      fail("published path cannot contain unpublished lessons");
    }
    if (content.quizzes.some((quiz) => quiz.status !== PUBLISHED_STATUS)) {
      fail("published path cannot contain unpublished quizzes");
    }
  }
  validateNoBlockingMarkers(content, "learning_content");
  return content;
}

const LOADED_LEARNING_CONTENT = validateLearningContent(rawLearningContent as unknown);

export function loadLearningContent(): LearningContent {
  return LOADED_LEARNING_CONTENT;
}

export function getLearningPath(content: LearningContent, slug: string): LearningPath {
  if (content.path.slug !== slug) throw new Error("Requested learning path was not found");
  return content.path;
}

export function getLearningLesson(content: LearningContent, slug: string): LearningLesson {
  const lesson = content.lessons.find((entry) => entry.slug === slug);
  if (lesson === undefined) throw new Error("Requested learning lesson was not found");
  return lesson;
}

export function getQuizForLesson(content: LearningContent, lessonSlug: string): LearningQuiz {
  const lesson = getLearningLesson(content, lessonSlug);
  const quizId = lesson.knowledge_check_ids[0];
  if (quizId === undefined) throw new Error("Learning lesson has no knowledge check");
  const quiz = content.quizzes.find((entry) => entry.id === quizId);
  if (quiz === undefined) throw new Error("Learning knowledge check was not found");
  return quiz;
}

export function getSourcesForIds(
  content: LearningContent,
  sourceIds: ReadonlyArray<string>,
): LearningSource[] {
  const byId = new Map(content.sources.map((source) => [source.id, source]));
  return sourceIds.flatMap((sourceId) => {
    const source = byId.get(sourceId);
    return source === undefined ? [] : [source];
  });
}
