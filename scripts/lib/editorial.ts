import {
  EditorialSchema,
  EpisodeMetadataSchema,
  TranscriptSchema,
  type Editorial,
  type EpisodeMetadata,
  type Transcript,
} from "../../src/domain/schema";
import {
  generateMinuteClips,
  type MinuteClip,
} from "../../src/domain/minute-clips";

const TIME_EPSILON_SEC = 0.002;

export interface ValidatedEpisodeData {
  metadata: EpisodeMetadata;
  transcript: Transcript;
  editorial: Editorial;
  minuteClips: MinuteClip[];
}

function equalTime(left: number, right: number): boolean {
  return Math.abs(left - right) <= TIME_EPSILON_SEC;
}

function assertOrderedNonOverlapping(
  ranges: { id: string; startSec: number; endSec: number }[],
  label: string,
): void {
  const sorted = [...ranges].sort(
    (left, right) =>
      left.startSec - right.startSec || left.endSec - right.endSec,
  );
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startSec < sorted[index - 1].endSec) {
      throw new Error(
        `${label} ranges overlap: ${sorted[index - 1].id} and ${sorted[index].id}`,
      );
    }
  }
}

export function validateEpisodeData(
  metadataValue: unknown,
  transcriptValue: unknown,
  editorialValue: unknown,
): ValidatedEpisodeData {
  const metadata = EpisodeMetadataSchema.parse(metadataValue);
  const transcript = TranscriptSchema.parse(transcriptValue);
  const editorial = EditorialSchema.parse(editorialValue);
  if (
    transcript.episodeId !== metadata.id ||
    editorial.episodeId !== metadata.id
  ) {
    throw new Error(`Episode data IDs do not match ${metadata.id}`);
  }

  const finalPhrase = transcript.phrases.at(-1);
  if (!finalPhrase || finalPhrase.endSec > metadata.durationSec + 1) {
    throw new Error(`${metadata.id}: transcript exceeds source duration`);
  }
  const phraseById = new Map(
    transcript.phrases.map((phrase) => [phrase.id, phrase]),
  );
  if (phraseById.size !== transcript.phrases.length) {
    throw new Error(`${metadata.id}: duplicate phrase IDs`);
  }

  const ranges = [...editorial.topics, ...editorial.exclusions];
  for (const range of ranges) {
    const startPhrase = phraseById.get(range.startPhraseId);
    const endPhrase = phraseById.get(range.endPhraseId);
    if (!startPhrase || !endPhrase) {
      throw new Error(`${metadata.id}: ${range.id} references a missing phrase`);
    }
    if (startPhrase.index > endPhrase.index) {
      throw new Error(`${metadata.id}: ${range.id} has reversed phrase IDs`);
    }
    if (
      !equalTime(range.startSec, startPhrase.startSec) ||
      !equalTime(range.endSec, endPhrase.endSec)
    ) {
      throw new Error(
        `${metadata.id}: ${range.id} timestamps must equal phrase boundaries`,
      );
    }
    if (range.endSec > metadata.durationSec + 1) {
      throw new Error(`${metadata.id}: ${range.id} exceeds source duration`);
    }
  }

  assertOrderedNonOverlapping(editorial.topics, "Topic");
  assertOrderedNonOverlapping(editorial.exclusions, "Exclusion");
  for (const topic of editorial.topics) {
    for (const exclusion of editorial.exclusions) {
      if (
        topic.startSec < exclusion.endSec &&
        topic.endSec > exclusion.startSec
      ) {
        throw new Error(
          `${metadata.id}: topic ${topic.id} intersects exclusion ${exclusion.id}`,
        );
      }
    }
  }

  const minuteClips = generateMinuteClips(
    transcript.phrases,
    editorial.exclusions,
    { idPrefix: `${metadata.id}-minute` },
  );
  if (minuteClips.length === 0) {
    throw new Error(`${metadata.id}: no valid minute clips`);
  }

  return { metadata, transcript, editorial, minuteClips };
}
