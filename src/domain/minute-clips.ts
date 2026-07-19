import type { Phrase } from "./schema";

const TIME_EPSILON_SEC = 0.001;

export interface MinuteClip {
  id: string;
  startPhraseId: string;
  endPhraseId: string;
  startPhraseIndex: number;
  endPhraseIndex: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  text: string;
}

export interface MinuteClipOptions {
  minDurationSec?: number;
  targetDurationSec?: number;
  maxDurationSec?: number;
  idPrefix?: string;
}

export interface MinuteClipExclusion {
  startSec: number;
  endSec: number;
}

const DEFAULT_OPTIONS = {
  minDurationSec: 45,
  targetDurationSec: 60,
  maxDurationSec: 75,
  idPrefix: "minute",
} satisfies Required<MinuteClipOptions>;

function intersectsExcludedRange(
  startSec: number,
  endSec: number,
  exclusions: readonly MinuteClipExclusion[],
): boolean {
  return exclusions.some(
    (range) =>
      startSec < range.endSec && endSec > range.startSec,
  );
}

function resolveOptions(
  options: MinuteClipOptions,
): Required<MinuteClipOptions> {
  const resolved = { ...DEFAULT_OPTIONS, ...options };

  if (
    resolved.minDurationSec <= 0 ||
    resolved.minDurationSec > resolved.targetDurationSec ||
    resolved.targetDurationSec > resolved.maxDurationSec
  ) {
    throw new Error(
      "Minute clip durations must satisfy 0 < minDurationSec <= targetDurationSec <= maxDurationSec",
    );
  }

  if (resolved.idPrefix.length === 0) {
    throw new Error("Minute clip idPrefix must not be empty");
  }

  return resolved;
}

/**
 * Builds a stable sequence of non-overlapping, sentence-bounded clips.
 *
 * A clip can start at the first phrase or immediately after a complete phrase,
 * and can end only at a complete phrase. For every earliest available start,
 * the valid end closest to the target duration wins; an earlier end resolves a
 * tie. Excluded ranges use half-open interval semantics, so touching a boundary
 * is allowed while crossing it is not.
 */
export function generateMinuteClips(
  phrases: readonly Phrase[],
  exclusions: readonly MinuteClipExclusion[],
  options: MinuteClipOptions = {},
): MinuteClip[] {
  const {
    minDurationSec,
    targetDurationSec,
    maxDurationSec,
    idPrefix,
  } = resolveOptions(options);
  const clips: MinuteClip[] = [];
  let availableAfterSec = 0;
  let startIndex = 0;

  while (startIndex < phrases.length) {
    const startPhrase = phrases[startIndex];
    const followsCompletePhrase =
      startIndex === 0 || phrases[startIndex - 1].complete;

    if (
      !followsCompletePhrase ||
      startPhrase.startSec < availableAfterSec - TIME_EPSILON_SEC
    ) {
      startIndex += 1;
      continue;
    }

    let bestEndIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let endIndex = startIndex; endIndex < phrases.length; endIndex += 1) {
      const endPhrase = phrases[endIndex];
      const durationSec = endPhrase.endSec - startPhrase.startSec;

      if (durationSec > maxDurationSec + TIME_EPSILON_SEC) {
        break;
      }

      if (
        intersectsExcludedRange(
          startPhrase.startSec,
          endPhrase.endSec,
          exclusions,
        )
      ) {
        // Every later candidate contains this same excluded interval.
        break;
      }

      if (
        !endPhrase.complete ||
        durationSec < minDurationSec - TIME_EPSILON_SEC
      ) {
        continue;
      }

      const distance = Math.abs(durationSec - targetDurationSec);
      if (distance < bestDistance - TIME_EPSILON_SEC) {
        bestDistance = distance;
        bestEndIndex = endIndex;
      }

      if (distance <= TIME_EPSILON_SEC) {
        break;
      }
    }

    if (bestEndIndex < 0) {
      startIndex += 1;
      continue;
    }

    const endPhrase = phrases[bestEndIndex];
    const startSec = startPhrase.startSec;
    const endSec = endPhrase.endSec;

    clips.push({
      id: `${idPrefix}:${startPhrase.id}:${endPhrase.id}`,
      startPhraseId: startPhrase.id,
      endPhraseId: endPhrase.id,
      startPhraseIndex: startPhrase.index,
      endPhraseIndex: endPhrase.index,
      startSec,
      endSec,
      durationSec: endSec - startSec,
      text: phrases
        .slice(startIndex, bestEndIndex + 1)
        .map((phrase) => phrase.text)
        .join(" "),
    });

    availableAfterSec = endSec;
    startIndex = bestEndIndex + 1;
  }

  return clips;
}
