import { describe, expect, it } from "vitest";

import {
  generateMinuteClips,
  type MinuteClipExclusion,
} from "../../src/domain/minute-clips";
import type { Phrase } from "../../src/domain/schema";

function phrase(
  index: number,
  startSec: number,
  endSec: number,
  complete = true,
): Phrase {
  return {
    id: `phrase-${index}`,
    index,
    sourceSegmentStart: index,
    sourceSegmentEnd: index,
    startSec,
    endSec,
    text: `Фраза ${index}.`,
    complete,
  };
}

function exclusion(
  startSec: number,
  endSec: number,
): MinuteClipExclusion {
  return {
    startSec,
    endSec,
  };
}

describe("minute clips", () => {
  it("creates deterministic non-overlapping clips closest to 60 seconds", () => {
    const phrases = Array.from({ length: 15 }, (_, index) =>
      phrase(index, index * 10, (index + 1) * 10),
    );

    const first = generateMinuteClips(phrases, [], {
      idPrefix: "zc-2:minute",
    });
    const second = generateMinuteClips(phrases, [], {
      idPrefix: "zc-2:minute",
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject([
      {
        id: "zc-2:minute:phrase-0:phrase-5",
        startSec: 0,
        endSec: 60,
        durationSec: 60,
      },
      {
        id: "zc-2:minute:phrase-6:phrase-11",
        startSec: 60,
        endSec: 120,
        durationSec: 60,
      },
    ]);
    expect(first[0].endSec).toBeLessThanOrEqual(first[1].startSec);
  });

  it("chooses the earlier ending when two clips are equally close to target", () => {
    const phrases = [
      phrase(0, 0, 20),
      phrase(1, 20, 40),
      phrase(2, 40, 55),
      phrase(3, 55, 65),
    ];

    expect(generateMinuteClips(phrases, [])).toMatchObject([
      {
        startPhraseId: "phrase-0",
        endPhraseId: "phrase-2",
        durationSec: 55,
      },
    ]);
  });

  it("never crosses an excluded range but may touch its boundaries", () => {
    const phrases = Array.from({ length: 10 }, (_, index) =>
      phrase(index, index * 15, (index + 1) * 15),
    );

    const clips = generateMinuteClips(phrases, [exclusion(60, 75)]);

    expect(clips).toMatchObject([
      { startSec: 0, endSec: 60, durationSec: 60 },
      { startSec: 75, endSec: 135, durationSec: 60 },
    ]);
    expect(
      clips.some((clip) => clip.startSec < 75 && clip.endSec > 60),
    ).toBe(false);
  });

  it("allows incomplete phrases inside a clip but not as an end or new start", () => {
    const phrases = [
      phrase(0, 0, 20, false),
      phrase(1, 20, 45, false),
      phrase(2, 45, 65, true),
      phrase(3, 65, 85, false),
      phrase(4, 85, 125, true),
    ];

    expect(generateMinuteClips(phrases, [exclusion(0, 5)])).toMatchObject([
      {
        startPhraseId: "phrase-3",
        endPhraseId: "phrase-4",
        startSec: 65,
        endSec: 125,
      },
    ]);
  });

  it("omits tails that cannot fit the 45–75 second interval", () => {
    const phrases = [
      phrase(0, 0, 30, false),
      phrase(1, 30, 44),
      phrase(2, 44, 80),
    ];

    expect(generateMinuteClips(phrases, [])).toEqual([]);
  });

  it("supports custom duration bounds and validates their order", () => {
    const phrases = [phrase(0, 0, 20), phrase(1, 20, 40)];

    expect(
      generateMinuteClips(phrases, [], {
        minDurationSec: 30,
        targetDurationSec: 35,
        maxDurationSec: 40,
      }),
    ).toHaveLength(1);

    expect(() =>
      generateMinuteClips(phrases, [], {
        minDurationSec: 61,
        targetDurationSec: 60,
      }),
    ).toThrow("0 < minDurationSec");
  });
});
