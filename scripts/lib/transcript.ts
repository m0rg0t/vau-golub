import {
  TranscriptSchema,
  type Phrase,
  type Transcript,
} from "../../src/domain/schema";
import type { AudioManifest } from "./audio";
import type { WhisperChunkResult } from "./whisper";

const TERMINAL_PUNCTUATION = /[.!?…][»”"'’)\]]*$/u;

function normalizeText(parts: string[]): string {
  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .trim();
}

export function normalizeTranscript(
  episodeId: string,
  manifest: AudioManifest,
  results: WhisperChunkResult[],
): Transcript {
  if (manifest.episodeId !== episodeId) {
    throw new Error("Audio manifest belongs to another episode");
  }
  if (results.length !== manifest.chunks.length) {
    throw new Error(
      `Expected ${manifest.chunks.length} Whisper results, got ${results.length}`,
    );
  }

  const sortedResults = [...results].sort(
    (left, right) => left.chunk.index - right.chunk.index,
  );
  const absoluteSegments = sortedResults.flatMap((result, resultIndex) => {
    const chunk = manifest.chunks[resultIndex];
    if (
      result.episodeId !== episodeId ||
      result.chunk.index !== chunk.index ||
      result.chunk.sha256 !== chunk.sha256 ||
      Math.abs(result.chunk.startSec - chunk.startSec) > 0.001 ||
      Math.abs(result.chunk.endSec - chunk.endSec) > 0.001
    ) {
      throw new Error(`Whisper result does not match chunk ${chunk.index}`);
    }

    return result.response.segments.map((segment) => ({
      startSec: chunk.startSec + segment.start,
      endSec: chunk.startSec + segment.end,
      text: segment.text.trim(),
    }));
  });

  const phrases: Phrase[] = [];
  let buffered: (typeof absoluteSegments)[number][] = [];
  let bufferedSourceStart = 0;
  let sourceSegmentIndex = 0;
  let bufferedEndSec = 0;

  const flush = () => {
    if (buffered.length === 0) {
      return;
    }
    const text = normalizeText(buffered.map((segment) => segment.text));
    phrases.push({
      id: `${episodeId}-p-${String(phrases.length).padStart(5, "0")}`,
      index: phrases.length,
      sourceSegmentStart: bufferedSourceStart,
      sourceSegmentEnd: sourceSegmentIndex - 1,
      startSec: Number(
        Math.min(...buffered.map((segment) => segment.startSec)).toFixed(3),
      ),
      endSec: Number(
        Math.max(...buffered.map((segment) => segment.endSec)).toFixed(3),
      ),
      text,
      complete: TERMINAL_PUNCTUATION.test(text),
    });
    buffered = [];
    bufferedSourceStart = sourceSegmentIndex;
    bufferedEndSec = 0;
  };

  for (const segment of absoluteSegments) {
    if (segment.endSec > manifest.sourceDurationSec + 1) {
      throw new Error("Transcript extends beyond the source audio duration");
    }

    const bufferedText = normalizeText(
      buffered.map((bufferedSegment) => bufferedSegment.text),
    );
    if (
      buffered.length > 0 &&
      segment.startSec >= bufferedEndSec - 0.001 &&
      TERMINAL_PUNCTUATION.test(bufferedText)
    ) {
      flush();
    }

    buffered.push(segment);
    sourceSegmentIndex += 1;
    bufferedEndSec = Math.max(bufferedEndSec, segment.endSec);
  }
  flush();

  const model = sortedResults[0]?.request.model;
  if (!model || phrases.length === 0) {
    throw new Error("Cannot create an empty transcript");
  }

  return TranscriptSchema.parse({
    schemaVersion: 1,
    episodeId,
    language: "ru",
    model,
    sourceSegmentCount: absoluteSegments.length,
    phrases,
  });
}
