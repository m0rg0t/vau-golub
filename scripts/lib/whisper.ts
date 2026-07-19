import { readFile } from "node:fs/promises";

import { z } from "zod";

import type { AudioChunk } from "./audio";

export const WhisperSegmentSchema = z
  .object({
    start: z.number().nonnegative(),
    end: z.number().positive(),
    text: z.string().trim().min(1),
  })
  .refine((segment) => segment.start < segment.end, {
    message: "Whisper segment start must precede its end",
  });

export const WhisperResponseSchema = z.object({
  text: z.string(),
  segments: z.array(WhisperSegmentSchema).min(1),
});

export const WhisperChunkResultSchema = z.object({
  schemaVersion: z.literal(1),
  episodeId: z.string().regex(/^zc-[0-9]+(?:-[0-9]+)?$/),
  chunk: z.object({
    index: z.number().int().nonnegative(),
    startSec: z.number().nonnegative(),
    endSec: z.number().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  request: z.object({
    apiBase: z.string().url(),
    model: z.string().min(1),
    language: z.literal("ru"),
    promptSha256: z.string().regex(/^[a-f0-9]{64}$/),
    pipelineVersion: z.literal("whisper-v1"),
  }),
  response: WhisperResponseSchema,
});

export type WhisperChunkResult = z.infer<typeof WhisperChunkResultSchema>;
export type WhisperResponse = z.infer<typeof WhisperResponseSchema>;

class PermanentWhisperError extends Error {}

export function validateWhisperResponse(
  value: unknown,
  chunkDurationSec: number,
): WhisperResponse {
  const response = WhisperResponseSchema.parse(value);
  const normalizedSegments = response.segments.map((segment) => {
    if (segment.start >= chunkDurationSec) {
      throw new Error(
        `Whisper segment starts after its chunk: ${segment.start}s`,
      );
    }
    if (segment.end > chunkDurationSec + 30) {
      throw new Error(
        `Whisper segment overshoots its chunk by more than one decode window`,
      );
    }
    return {
      ...segment,
      end: Math.min(segment.end, chunkDurationSec),
    };
  });

  return { ...response, segments: normalizedSegments };
}

export async function requestTranscription(
  input: {
    path: string;
    filename: string;
    model: string;
    apiBase: string;
    prompt: string;
    chunk: AudioChunk;
    onInvalidResponse?: (value: unknown) => Promise<void>;
  },
  fetchImplementation: typeof fetch = fetch,
): Promise<WhisperResponse> {
  const endpoint = new URL("/v1/audio/transcriptions", input.apiBase);
  const file = await readFile(input.path);
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const form = new FormData();
    form.set(
      "file",
      new Blob([file], { type: "audio/wav" }),
      input.filename,
    );
    form.set("model", input.model);
    form.set("language", "ru");
    form.set("prompt", input.prompt);
    form.set("response_format", "verbose_json");
    form.set("stream", "false");
    form.set("diarize", "false");

    try {
      const response = await fetchImplementation(endpoint, {
        method: "POST",
        body: form,
      });
      if (response.ok) {
        const value: unknown = await response.json();
        try {
          return validateWhisperResponse(
            value,
            input.chunk.endSec - input.chunk.startSec,
          );
        } catch (error) {
          await input.onInvalidResponse?.(value);
          throw new PermanentWhisperError(
            error instanceof Error ? error.message : "Invalid Whisper response",
          );
        }
      }

      const details = (await response.text()).slice(0, 500);
      const error = new Error(
        `Whisper request failed: HTTP ${response.status} ${details}`,
      );
      if (
        response.status !== 408 &&
        response.status !== 429 &&
        response.status < 500
      ) {
        throw new PermanentWhisperError(error.message);
      }
      lastError = error;
    } catch (error) {
      if (error instanceof PermanentWhisperError) {
        throw error;
      }
      lastError = error;
    }

    if (attempt < 3) {
      await new Promise((resolveDelay) =>
        setTimeout(resolveDelay, 2 ** (attempt - 1) * 1000),
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Whisper request failed after retries");
}
