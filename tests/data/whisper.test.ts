import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  requestTranscription,
  validateWhisperResponse,
} from "../../scripts/lib/whisper";

describe("Whisper contract", () => {
  it("sends the expected multipart request", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "sdvg-whisper-"));
    const path = resolve(directory, "chunk.wav");
    await writeFile(path, new Uint8Array([82, 73, 70, 70]));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        text: "Привет.",
        segments: [{ start: 0, end: 1.2, text: " Привет." }],
      }),
    );

    await requestTranscription(
      {
        path,
        filename: "chunk.wav",
        model: "large-v3-turbo-q5_0",
        apiBase: "http://127.0.0.1:12017",
        prompt: "Завтракаст",
        chunk: {
          index: 0,
          startSec: 0,
          endSec: 10,
          relativePath: "chunk.wav",
          sha256: "a".repeat(64),
          actualDurationSec: 10,
          sampleRate: 16000,
          channels: 1,
          codec: "pcm_s16le",
        },
      },
      fetchMock,
    );

    const [, init] = fetchMock.mock.calls[0];
    const body = init?.body as FormData;
    expect(body.get("model")).toBe("large-v3-turbo-q5_0");
    expect(body.get("language")).toBe("ru");
    expect(body.get("response_format")).toBe("verbose_json");
    expect(body.get("stream")).toBe("false");
  });

  it("accepts nested interjections and clips one decode-window overshoot", () => {
    expect(() =>
      validateWhisperResponse(
        {
          text: "ok",
          segments: [
            { start: 37.76, end: 67.76, text: "Длинная реплика." },
            { start: 44.49, end: 45.49, text: "Перебивка." },
          ],
        },
        100,
      ),
    ).not.toThrow();

    expect(
      validateWhisperResponse(
        {
          text: "end",
          segments: [{ start: 9.5, end: 12, text: "Конец." }],
        },
        10,
      ).segments[0].end,
    ).toBe(10);

    expect(() =>
      validateWhisperResponse(
        {
          text: "bad",
          segments: [{ start: 10, end: 12, text: "После файла." }],
        },
        10,
      ),
    ).toThrow("starts after its chunk");
  });

  it("merges zero-duration punctuation and drops untimed speech", () => {
    const response = validateWhisperResponse(
      {
        text: "Фраза!",
        segments: [
          { start: 1, end: 2, text: " Фраза" },
          { start: 2, end: 2, text: "!" },
        ],
      },
      10,
    );
    expect(response.segments).toEqual([
      { start: 1, end: 2, text: "Фраза!" },
    ]);

    expect(
      validateWhisperResponse(
        {
          text: "Слово",
          segments: [
            { start: 1, end: 2, text: "Контекст." },
            { start: 2, end: 2, text: "Слово" },
          ],
        },
        10,
      ).segments,
    ).toEqual([{ start: 1, end: 2, text: "Контекст." }]);
  });

  it("drops a zero-duration duplicate found in recent context", () => {
    const response = validateWhisperResponse(
      {
        text: "Им удалось его достигнуть.",
        segments: [
          {
            start: 1,
            end: 2,
            text: "Этот успех, ну, им удалось его достигнуть.",
          },
          {
            start: 2,
            end: 2,
            text: " этот успех ну им удалось его достигнуть",
          },
          { start: 2.1, end: 3, text: "Следующая мысль." },
        ],
      },
      10,
    );

    expect(response.segments.map((segment) => segment.text)).toEqual([
      "Этот успех, ну, им удалось его достигнуть.",
      "Следующая мысль.",
    ]);
  });
});
