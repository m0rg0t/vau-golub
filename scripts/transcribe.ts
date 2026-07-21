import { access } from "node:fs/promises";
import { resolve } from "node:path";

import { isMainModule } from "./lib/entrypoint";
import { AudioManifestSchema } from "./lib/audio";
import { loadSelectedEpisodes, projectRoot } from "./lib/catalog";
import {
  argumentValue,
  readJson,
  requestedEpisode,
  textSha256,
  writeJsonAtomic,
} from "./lib/files";
import {
  WhisperChunkResultSchema,
  requestTranscription,
  validateWhisperResponse,
} from "./lib/whisper";

const DEFAULT_API_BASE = "http://localhost:12017";
const DEFAULT_MODEL = "large-v3-turbo-q5_0";
const PROMPT = [
  "Завтракаст — русскоязычный подкаст о технологиях, играх, кино и медиа.",
  "Ведущие: Тимур Сейф48, Максим Зарецкий, Дима Зомбак.",
  "Термины: Apple, Google, Microsoft, PlayStation, Xbox, Nintendo, Steam,",
  "DLSS, GeForce, iPhone, macOS, Telegram, YouTube.",
].join(" ");
const PIPELINE_VERSION = "whisper-v1";
const PROMPT_SHA256 = textSha256(PROMPT);

async function reusableResult(
  path: string,
  expected: {
    chunkSha256: string;
    model: string;
    promptSha256: string;
  },
): Promise<boolean> {
  try {
    await access(path);
    const result = WhisperChunkResultSchema.parse(await readJson(path));
    return (
      result.chunk.sha256 === expected.chunkSha256 &&
      result.request.model === expected.model &&
      result.request.promptSha256 === expected.promptSha256 &&
      result.request.pipelineVersion === PIPELINE_VERSION
    );
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const episodes = await loadSelectedEpisodes(requestedEpisode());
  const requestedChunkValue = argumentValue("--chunk");
  const requestedChunk =
    requestedChunkValue === null ? null : Number(requestedChunkValue);
  if (
    requestedChunk !== null &&
    (!Number.isInteger(requestedChunk) || requestedChunk < 0)
  ) {
    throw new Error("--chunk must be a non-negative integer");
  }
  const apiBase =
    process.env.WHISPER_API_BASE ?? argumentValue("--api-base") ?? DEFAULT_API_BASE;
  const model =
    process.env.WHISPER_MODEL ?? argumentValue("--model") ?? DEFAULT_MODEL;

  for (const episode of episodes) {
    const chunkDirectory = resolve(projectRoot, ".cache", "chunks", episode.id);
    const resultDirectory = resolve(projectRoot, ".cache", "whisper", episode.id);
    const manifest = AudioManifestSchema.parse(
      await readJson(resolve(chunkDirectory, "manifest.json")),
    );

    const chunks =
      requestedChunk === null
        ? manifest.chunks
        : manifest.chunks.filter((chunk) => chunk.index === requestedChunk);
    if (chunks.length === 0) {
      throw new Error(`Chunk ${requestedChunk} does not exist for ${episode.id}`);
    }

    for (const chunk of chunks) {
      const resultPath = resolve(
        resultDirectory,
        `${String(chunk.index).padStart(3, "0")}.json`,
      );
      const invalidResultPath = resolve(
        resultDirectory,
        `${String(chunk.index).padStart(3, "0")}.invalid.json`,
      );
      if (
        await reusableResult(resultPath, {
          chunkSha256: chunk.sha256,
          model,
          promptSha256: PROMPT_SHA256,
        })
      ) {
        process.stdout.write(`↷ ${episode.id}/${chunk.index}: уже готово\n`);
        continue;
      }

      let response;
      try {
        response = validateWhisperResponse(
          await readJson(invalidResultPath),
          chunk.endSec - chunk.startSec,
        );
        process.stdout.write(
          `↻ ${episode.id}/${chunk.index}: восстановлено из диагностики\n`,
        );
      } catch {
        process.stdout.write(`… ${episode.id}/${chunk.index}: распознавание\n`);
        response = await requestTranscription({
          path: resolve(chunkDirectory, chunk.relativePath),
          filename: `${episode.id}-${chunk.index}.wav`,
          model,
          apiBase,
          prompt: PROMPT,
          chunk,
          onInvalidResponse: (value) =>
            writeJsonAtomic(invalidResultPath, value),
        });
      }
      await writeJsonAtomic(
        resultPath,
        WhisperChunkResultSchema.parse({
          schemaVersion: 1,
          episodeId: episode.id,
          chunk: {
            index: chunk.index,
            startSec: chunk.startSec,
            endSec: chunk.endSec,
            sha256: chunk.sha256,
          },
          request: {
            apiBase,
            model,
            language: "ru",
            promptSha256: PROMPT_SHA256,
            pipelineVersion: PIPELINE_VERSION,
          },
          response,
        }),
      );
      process.stdout.write(`✓ ${episode.id}/${chunk.index}: сохранено\n`);
    }
  }
}

if (isMainModule(import.meta)) {
  await main();
}
