import { describe, expect, it } from "vitest";

import type { AudioManifest } from "../../scripts/lib/audio";
import { normalizeTranscript } from "../../scripts/lib/transcript";
import type { WhisperChunkResult } from "../../scripts/lib/whisper";

const manifest: AudioManifest = {
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
      startSec: 10,
      endSec: 20,
      relativePath: "001.wav",
      sha256: "c".repeat(64),
      actualDurationSec: 10,
      sampleRate: 16000,
      channels: 1,
      codec: "pcm_s16le",
    },
  ],
};

function result(
  index: number,
  sha256: string,
  segments: { start: number; end: number; text: string }[],
): WhisperChunkResult {
  return {
    schemaVersion: 1,
    episodeId: "zc-02",
    chunk: {
      index,
      startSec: index * 10,
      endSec: index * 10 + 10,
      sha256,
    },
    request: {
      apiBase: "http://127.0.0.1:12017",
      model: "large-v3-turbo-q5_0",
      language: "ru",
      promptSha256: "d".repeat(64),
      pipelineVersion: "whisper-v1",
    },
    response: {
      text: segments.map((segment) => segment.text).join(" "),
      segments,
    },
  };
}

describe("transcript normalization", () => {
  it("joins a sentence across chunks without inventing a timestamp", () => {
    const transcript = normalizeTranscript("zc-02", manifest, [
      result(0, "b".repeat(64), [
        { start: 0.5, end: 9.5, text: "Это начало" },
      ]),
      result(1, "c".repeat(64), [
        { start: 0.2, end: 1.5, text: "предложения." },
        { start: 2, end: 3, text: "Дальше!" },
      ]),
    ]);

    expect(transcript.sourceSegmentCount).toBe(3);
    expect(transcript.phrases).toEqual([
      expect.objectContaining({
        sourceSegmentStart: 0,
        sourceSegmentEnd: 1,
        startSec: 0.5,
        endSec: 11.5,
        text: "Это начало предложения.",
        complete: true,
      }),
      expect.objectContaining({
        sourceSegmentStart: 2,
        sourceSegmentEnd: 2,
        startSec: 12,
        endSec: 13,
        text: "Дальше!",
        complete: true,
      }),
    ]);
  });

  it("rejects a missing chunk result", () => {
    expect(() =>
      normalizeTranscript("zc-02", manifest, [
        result(0, "b".repeat(64), [
          { start: 0, end: 1, text: "Текст." },
        ]),
      ]),
    ).toThrow("Expected 2 Whisper results");
  });

  it("keeps nested interjections in one timestamp envelope", () => {
    const oneChunk = {
      ...manifest,
      sourceDurationSec: 10,
      chunks: [manifest.chunks[0]],
    };
    const transcript = normalizeTranscript("zc-02", oneChunk, [
      result(0, "b".repeat(64), [
        { start: 1, end: 7, text: "Длинная реплика." },
        { start: 3, end: 4, text: "Перебивка." },
        { start: 7.5, end: 8, text: "Следующая." },
      ]),
    ]);

    expect(transcript.phrases[0]).toEqual(
      expect.objectContaining({
        sourceSegmentStart: 0,
        sourceSegmentEnd: 1,
        startSec: 1,
        endSec: 7,
        text: "Длинная реплика. Перебивка.",
      }),
    );
    expect(transcript.phrases[1].startSec).toBe(7.5);
  });
});
