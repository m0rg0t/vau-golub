import { resolve } from "node:path";

import { AudioManifestSchema } from "./lib/audio";
import { loadSelectedEpisodes, projectRoot } from "./lib/catalog";
import { readJson, requestedEpisode, writeJsonAtomic } from "./lib/files";
import { normalizeTranscript } from "./lib/transcript";
import { WhisperChunkResultSchema } from "./lib/whisper";

async function main(): Promise<void> {
  const episodes = await loadSelectedEpisodes(requestedEpisode());

  for (const episode of episodes) {
    const chunkDirectory = resolve(projectRoot, ".cache", "chunks", episode.id);
    const resultDirectory = resolve(projectRoot, ".cache", "whisper", episode.id);
    const manifest = AudioManifestSchema.parse(
      await readJson(resolve(chunkDirectory, "manifest.json")),
    );
    const results = await Promise.all(
      manifest.chunks.map((chunk) =>
        readJson(
          resolve(
            resultDirectory,
            `${String(chunk.index).padStart(3, "0")}.json`,
          ),
        ).then((value) => WhisperChunkResultSchema.parse(value)),
      ),
    );
    const transcript = normalizeTranscript(episode.id, manifest, results);
    await writeJsonAtomic(
      resolve(projectRoot, "data", "episodes", episode.id, "transcript.json"),
      transcript,
    );
    process.stdout.write(
      `✓ ${episode.id}: ${transcript.phrases.length} фраз\n`,
    );
  }
}

if (import.meta.main) {
  await main();
}
