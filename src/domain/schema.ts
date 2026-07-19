import { z } from "zod";

const HttpUrlSchema = z
  .url()
  .refine((value) => value.startsWith("https://"), "URL must use HTTPS");

export const YearSchema = z.number().int().min(2015).max(2026);

export const EpisodeMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^zc-[0-9]+(?:-[0-9]+)?$/),
  sourceId: z.number().int().positive(),
  sourceGuid: z.url(),
  slug: z.string().regex(/^[0-9]+(?:-[0-9]+)?$/),
  number: z.number().int().positive(),
  title: z.string().min(1),
  publishedAt: z.iso.datetime({ offset: true }),
  year: YearSchema,
  durationIso: z.string().regex(/^PT(?:(?:\d+)H)?(?:(?:\d+)M)?(?:(?:\d+)S)?$/),
  durationSec: z.number().int().positive(),
  pageUrl: HttpUrlSchema,
  coverSourceUrl: HttpUrlSchema,
  localCoverPath: z.string().regex(/^\/covers\/[a-z0-9-]+\.(?:jpg|jpeg|png|webp)$/),
  audioUrl: HttpUrlSchema,
  summary: z.string().min(1),
  showNotes: z.array(z.string().min(1)),
});

export type EpisodeMetadata = z.infer<typeof EpisodeMetadataSchema>;

export const SelectedEpisodeSchema = z.object({
  year: YearSchema,
  id: EpisodeMetadataSchema.shape.id,
  sourceId: EpisodeMetadataSchema.shape.sourceId,
  sourceGuid: EpisodeMetadataSchema.shape.sourceGuid,
  slug: EpisodeMetadataSchema.shape.slug,
  number: EpisodeMetadataSchema.shape.number,
  publishedAt: EpisodeMetadataSchema.shape.publishedAt,
  pageUrl: EpisodeMetadataSchema.shape.pageUrl,
});

export const SelectionSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    type: z.literal("wordpress"),
    apiUrl: HttpUrlSchema,
    categoryId: z.number().int().positive(),
    snapshotAt: z.iso.datetime({ offset: true }),
  }),
  seed: z.string().min(1),
  selectionAlgorithm: z.literal("one-per-year-v1"),
  years: z.array(YearSchema).length(12),
  eligibleCountsByYear: z.record(z.string().regex(/^20(?:1[5-9]|2[0-6])$/), z.number().int().positive()),
  episodes: z.array(SelectedEpisodeSchema).length(12),
});

export type EpisodeSelection = z.infer<typeof SelectionSchema>;

export const PhraseSchema = z
  .object({
    id: z.string().min(1),
    index: z.number().int().nonnegative(),
    sourceSegmentStart: z.number().int().nonnegative(),
    sourceSegmentEnd: z.number().int().nonnegative(),
    startSec: z.number().nonnegative(),
    endSec: z.number().positive(),
    text: z.string().trim().min(1),
    complete: z.boolean(),
  })
  .refine((phrase) => phrase.startSec < phrase.endSec, {
    message: "Phrase start must precede its end",
  });

export const TranscriptSchema = z.object({
    schemaVersion: z.literal(1),
    episodeId: EpisodeMetadataSchema.shape.id,
    language: z.literal("ru"),
    model: z.string().min(1),
    sourceSegmentCount: z.number().int().positive(),
    phrases: z.array(PhraseSchema).min(1),
  })
  .superRefine((transcript, context) => {
    let previousStartSec = 0;
    let previousEndSec = 0;
    let expectedSourceSegment = 0;

    for (const [index, phrase] of transcript.phrases.entries()) {
      if (phrase.index !== index) {
        context.addIssue({
          code: "custom",
          path: ["phrases", index, "index"],
          message: "Phrase indices must be contiguous",
        });
      }
      if (
        phrase.startSec + 0.001 < previousStartSec ||
        phrase.endSec + 0.001 < previousEndSec
      ) {
        context.addIssue({
          code: "custom",
          path: ["phrases", index, "startSec"],
          message: "Phrase starts and ends must be monotonic",
        });
      }
      if (
        phrase.sourceSegmentStart !== expectedSourceSegment ||
        phrase.sourceSegmentEnd < phrase.sourceSegmentStart
      ) {
        context.addIssue({
          code: "custom",
          path: ["phrases", index, "sourceSegmentStart"],
          message: "Every source segment must belong to exactly one phrase",
        });
      }
      previousStartSec = phrase.startSec;
      previousEndSec = phrase.endSec;
      expectedSourceSegment = phrase.sourceSegmentEnd + 1;
    }

    if (expectedSourceSegment !== transcript.sourceSegmentCount) {
      context.addIssue({
        code: "custom",
        path: ["sourceSegmentCount"],
        message: "Phrase mappings must cover every source segment",
      });
    }
  });

export type Transcript = z.infer<typeof TranscriptSchema>;
export type Phrase = z.infer<typeof PhraseSchema>;

export const EditorialRangeSchema = z
  .object({
    id: z.string().min(1),
    startPhraseId: z.string().min(1),
    endPhraseId: z.string().min(1),
    startSec: z.number().nonnegative(),
    endSec: z.number().positive(),
  })
  .refine((range) => range.startSec < range.endSec, {
    message: "Editorial range start must precede its end",
  });

export const TopicSchema = EditorialRangeSchema.extend({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
});

export const ExclusionSchema = EditorialRangeSchema.extend({
  kind: z.enum([
    "intro",
    "music",
    "ad",
    "donations",
    "thanks",
    "technical-pause",
  ]),
  reason: z.string().trim().min(1),
});

export const EditorialSchema = z.object({
  schemaVersion: z.literal(1),
  episodeId: EpisodeMetadataSchema.shape.id,
  topics: z.array(TopicSchema).min(1),
  exclusions: z.array(ExclusionSchema),
});

export type Editorial = z.infer<typeof EditorialSchema>;
