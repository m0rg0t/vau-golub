import { describe, expect, it } from "vitest";

import {
  AudioManifestSchema,
  chooseChunkBoundaries,
  parseSilenceMidpoints,
} from "../../scripts/lib/audio";

describe("audio chunking", () => {
  it("parses silence midpoints from successful ffmpeg stderr", () => {
    expect(
      parseSilenceMidpoints(
        [
          "[silencedetect] silence_start: 711",
          "[silencedetect] silence_end: 713 | silence_duration: 2",
        ].join("\n"),
      ),
    ).toEqual([712]);
  });

  it("prefers silence near the target and balances a short tail", () => {
    expect(chooseChunkBoundaries(2_000, [710, 1_430])).toEqual([
      0, 710, 1_400, 2_000,
    ]);
    expect(chooseChunkBoundaries(901, [])).toEqual([0, 450.5, 901]);
  });

  it("rejects gaps in a chunk manifest", () => {
    expect(() =>
      AudioManifestSchema.parse({
        schemaVersion: 1,
        episodeId: "zc-02",
        sourceAudioSha256: "a".repeat(64),
        sourceDurationSec: 20,
        chunks: [
          {
            index: 0,
            startSec: 0,
            endSec: 10,
            relativePath: "000.wav",
            sha256: "b".repeat(64),
            actualDurationSec: 10,
            sampleRate: 16000,
            channels: 1,
            codec: "pcm_s16le",
          },
          {
            index: 1,
            startSec: 11,
            endSec: 20,
            relativePath: "001.wav",
            sha256: "c".repeat(64),
            actualDurationSec: 9,
            sampleRate: 16000,
            channels: 1,
            codec: "pcm_s16le",
          },
        ],
      }),
    ).toThrow("Chunk ranges must be contiguous");
  });
});
