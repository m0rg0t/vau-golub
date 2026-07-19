import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { loadSelectedEpisodes, projectRoot } from "./lib/catalog";
import { validateEpisodeData } from "./lib/editorial";
import {
  argumentValue,
  readJson,
  textSha256,
  writeJsonAtomic,
  writeTextAtomic,
} from "./lib/files";

function webVttTimestamp(seconds: number): string {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const remainderSeconds = Math.floor((milliseconds % 60_000) / 1000);
  const remainderMilliseconds = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainderSeconds).padStart(2, "0")}.${String(remainderMilliseconds).padStart(3, "0")}`;
}

function buildCaptions(
  phrases: Array<{ startSec: number; endSec: number; text: string }>,
): string {
  const cues = phrases.map(
    (phrase, index) =>
      `${index + 1}\n${webVttTimestamp(phrase.startSec)} --> ${webVttTimestamp(phrase.endSec)}\n${phrase.text.replaceAll(/\s+/g, " ").trim()}`,
  );
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

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
    await writeTextAtomic(
      resolve(outputDirectory, `${metadata.id}.vtt`),
      buildCaptions(payload.transcript.phrases),
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
      durationSec: payload.metadata.durationSec,
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
