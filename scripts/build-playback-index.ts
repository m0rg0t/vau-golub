import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { loadSelectedEpisodes, projectRoot } from "./lib/catalog";
import { validateEpisodeData } from "./lib/editorial";
import {
  argumentValue,
  readJson,
  textSha256,
  writeJsonAtomic,
} from "./lib/files";

async function main(): Promise<void> {
  const metadataList = await loadSelectedEpisodes(argumentValue("--episode"));
  const outputDirectory = resolve(projectRoot, "public", "data", "episodes");
  await mkdir(outputDirectory, { recursive: true });

  const payloads = [];
  for (const metadata of metadataList) {
    const sourceDirectory = resolve(
      projectRoot,
      "data",
      "episodes",
      metadata.id,
    );
    const validated = validateEpisodeData(
      metadata,
      await readJson(resolve(sourceDirectory, "transcript.json")),
      await readJson(resolve(sourceDirectory, "editorial.json")),
    );
    const payload = {
      schemaVersion: 1,
      metadata: validated.metadata,
      transcript: validated.transcript,
      editorial: validated.editorial,
      minuteClips: validated.minuteClips,
    };
    payloads.push(payload);
    await writeJsonAtomic(
      resolve(outputDirectory, `${metadata.id}.json`),
      payload,
    );
  }

  const fingerprint = textSha256(JSON.stringify(payloads));
  const catalog = {
    schemaVersion: 1,
    fingerprint,
    episodes: payloads.map((payload) => ({
      id: payload.metadata.id,
      number: payload.metadata.number,
      title: payload.metadata.title,
      year: payload.metadata.year,
      publishedAt: payload.metadata.publishedAt,
      localCoverPath: payload.metadata.localCoverPath,
      dataPath: `/data/episodes/${payload.metadata.id}.json`,
      topicCount: payload.editorial.topics.length,
      minuteClipCount: payload.minuteClips.length,
    })),
    items: {
      topics: payloads.flatMap((payload) =>
        payload.editorial.topics.map((topic) => ({
          id: topic.id,
          episodeId: payload.metadata.id,
          kind: "topic" as const,
          title: topic.title,
          description: topic.summary,
          startSec: topic.startSec,
          endSec: topic.endSec,
        })),
      ),
      minute: payloads.flatMap((payload) =>
        payload.minuteClips.map((clip, index) => ({
          id: clip.id,
          episodeId: payload.metadata.id,
          kind: "minute" as const,
          title: `Минута ${index + 1}`,
          description:
            clip.text.length > 220
              ? `${clip.text.slice(0, 217).trimEnd()}…`
              : clip.text,
          startSec: clip.startSec,
          endSec: clip.endSec,
        })),
      ),
    },
  };
  await writeJsonAtomic(
    resolve(projectRoot, "public", "data", "catalog.json"),
    catalog,
  );
  process.stdout.write(
    `✓ Каталог ${fingerprint}: ${catalog.episodes.length} выпусков\n`,
  );
}

if (import.meta.main) {
  await main();
}
