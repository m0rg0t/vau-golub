import { execFile } from "node:child_process";
import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { isMainModule } from "./lib/entrypoint";
import { AudioManifestSchema, chooseChunkBoundaries, parseSilenceMidpoints } from "./lib/audio";
import { loadSelectedEpisodes, projectRoot } from "./lib/catalog";
import { fileSha256, requestedEpisode, writeJsonAtomic } from "./lib/files";

const execFileAsync = promisify(execFile);

async function audioDuration(path: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    path,
  ]);
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe returned an invalid duration for ${path}`);
  }
  return duration;
}

async function inspectWave(path: string): Promise<{
  actualDurationSec: number;
  sampleRate: 16000;
  channels: 1;
  codec: "pcm_s16le";
}> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=codec_name,sample_rate,channels:format=duration",
    "-of",
    "json",
    path,
  ]);
  const payload = JSON.parse(stdout) as {
    streams?: { codec_name?: string; sample_rate?: string; channels?: number }[];
    format?: { duration?: string };
  };
  const stream = payload.streams?.[0];
  const actualDurationSec = Number(payload.format?.duration);
  if (
    stream?.codec_name !== "pcm_s16le" ||
    Number(stream.sample_rate) !== 16000 ||
    stream.channels !== 1 ||
    !Number.isFinite(actualDurationSec)
  ) {
    throw new Error(`Invalid transcription WAV: ${path}`);
  }
  return {
    actualDurationSec,
    sampleRate: 16000,
    channels: 1,
    codec: "pcm_s16le",
  };
}

async function silenceMidpoints(path: string): Promise<number[]> {
  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      path,
      "-af",
      "silencedetect=noise=-36dB:d=0.45",
      "-f",
      "null",
      "-",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return parseSilenceMidpoints(stderr);
}

async function main(): Promise<void> {
  const episodes = await loadSelectedEpisodes(requestedEpisode());

  for (const episode of episodes) {
    const audioPath = resolve(projectRoot, ".cache", "audio", `${episode.id}.mp3`);
    const chunkDirectory = resolve(projectRoot, ".cache", "chunks", episode.id);
    const durationSec = await audioDuration(audioPath);
    const sourceAudioSha256 = await fileSha256(audioPath);
    const boundaries = chooseChunkBoundaries(
      durationSec,
      await silenceMidpoints(audioPath),
    );
    await mkdir(chunkDirectory, { recursive: true });

    const chunks = [];
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const startSec = boundaries[index];
      const endSec = boundaries[index + 1];
      const filename = `${String(index).padStart(3, "0")}.wav`;
      const path = resolve(chunkDirectory, filename);
      const temporaryPath = `${path}.${process.pid}.partial.wav`;

      await execFileAsync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(startSec),
        "-i",
        audioPath,
        "-t",
        String(endSec - startSec),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        temporaryPath,
      ]);
      await rename(temporaryPath, path);
      chunks.push({
        index,
        startSec,
        endSec,
        relativePath: filename,
        sha256: await fileSha256(path),
        ...(await inspectWave(path)),
      });
    }

    const manifest = AudioManifestSchema.parse({
      schemaVersion: 1,
      episodeId: episode.id,
      sourceAudioSha256,
      sourceDurationSec: durationSec,
      chunks,
    });
    await writeJsonAtomic(resolve(chunkDirectory, "manifest.json"), manifest);
    process.stdout.write(`✓ ${episode.id}: ${chunks.length} WAV-чанков\n`);
  }
}

if (isMainModule(import.meta)) {
  await main();
}
