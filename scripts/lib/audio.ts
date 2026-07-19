import { z } from "zod";

export const AudioChunkSchema = z
  .object({
    index: z.number().int().nonnegative(),
    startSec: z.number().nonnegative(),
    endSec: z.number().positive(),
    relativePath: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    actualDurationSec: z.number().positive(),
    sampleRate: z.literal(16000),
    channels: z.literal(1),
    codec: z.literal("pcm_s16le"),
  })
  .refine((chunk) => chunk.startSec < chunk.endSec, {
    message: "Audio chunk start must precede its end",
  });

export const AudioManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    episodeId: z.string().regex(/^zc-[0-9]+(?:-[0-9]+)?$/),
    sourceAudioSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceDurationSec: z.number().positive(),
    chunks: z.array(AudioChunkSchema).min(1),
  })
  .superRefine((manifest, context) => {
    for (const [index, chunk] of manifest.chunks.entries()) {
      const expectedStart = index === 0 ? 0 : manifest.chunks[index - 1].endSec;
      if (chunk.index !== index) {
        context.addIssue({
          code: "custom",
          path: ["chunks", index, "index"],
          message: "Chunk indices must be contiguous",
        });
      }
      if (Math.abs(chunk.startSec - expectedStart) > 0.002) {
        context.addIssue({
          code: "custom",
          path: ["chunks", index, "startSec"],
          message: "Chunk ranges must be contiguous",
        });
      }
      const expectedDuration = chunk.endSec - chunk.startSec;
      if (Math.abs(chunk.actualDurationSec - expectedDuration) > 0.05) {
        context.addIssue({
          code: "custom",
          path: ["chunks", index, "actualDurationSec"],
          message: "WAV duration must match its declared range",
        });
      }
    }
    const finalEnd = manifest.chunks.at(-1)?.endSec ?? 0;
    if (Math.abs(finalEnd - manifest.sourceDurationSec) > 0.002) {
      context.addIssue({
        code: "custom",
        path: ["chunks"],
        message: "Chunks must cover the complete source audio",
      });
    }
  });

export type AudioChunk = z.infer<typeof AudioChunkSchema>;
export type AudioManifest = z.infer<typeof AudioManifestSchema>;

export function chooseChunkBoundaries(
  durationSec: number,
  silenceMidpoints: number[],
  targetSec = 12 * 60,
  minimumSec = 10 * 60,
  maximumSec = 15 * 60,
  searchRadiusSec = 90,
): number[] {
  if (durationSec <= 0) {
    throw new Error("Audio duration must be positive");
  }
  if (!(minimumSec < targetSec && targetSec < maximumSec)) {
    throw new Error("Chunk target must be between minimum and maximum");
  }

  const boundaries = [0];
  let startSec = 0;
  const sortedSilences = [...silenceMidpoints]
    .filter((time) => time > 0 && time < durationSec)
    .sort((left, right) => left - right);

  while (durationSec - startSec > maximumSec) {
    const remaining = durationSec - startSec;
    if (remaining < minimumSec * 2) {
      const balanced = startSec + remaining / 2;
      boundaries.push(Number(balanced.toFixed(3)));
      startSec = balanced;
      continue;
    }

    const ideal = startSec + targetSec;
    const lower = Math.max(startSec + minimumSec, ideal - searchRadiusSec);
    const upper = Math.min(
      startSec + maximumSec,
      ideal + searchRadiusSec,
      durationSec - minimumSec,
    );
    const candidates = sortedSilences.filter(
      (time) => time >= lower && time <= upper,
    );
    const next = candidates.length
      ? candidates.sort(
          (left, right) =>
            Math.abs(left - ideal) - Math.abs(right - ideal) || left - right,
        )[0]
      : Math.min(Math.max(ideal, lower), upper);

    boundaries.push(Number(next.toFixed(3)));
    startSec = next;
  }

  boundaries.push(Number(durationSec.toFixed(3)));
  return boundaries;
}

export function parseSilenceMidpoints(ffmpegOutput: string): number[] {
  const starts: number[] = [];
  const midpoints: number[] = [];

  for (const line of ffmpegOutput.split("\n")) {
    const start = line.match(/silence_start:\s*([0-9.]+)/)?.[1];
    if (start) {
      starts.push(Number(start));
      continue;
    }

    const end = line.match(/silence_end:\s*([0-9.]+)/)?.[1];
    if (end && starts.length > 0) {
      const startSec = starts.shift();
      if (startSec !== undefined) {
        midpoints.push((startSec + Number(end)) / 2);
      }
    }
  }

  return midpoints;
}
