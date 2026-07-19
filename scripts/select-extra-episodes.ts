import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  AdditionalSelectionSchema,
  EpisodeMetadataSchema,
} from "../src/domain/schema";
import {
  ARCHIVE_API_URL,
  ARCHIVE_CATEGORY_ID,
  fetchArchive,
  resolveEpisodeCover,
} from "./lib/archive";

const projectRoot = resolve(import.meta.dirname, "..");

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const numbers = (argumentValue("--numbers") ?? "")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (numbers.length === 0 || new Set(numbers).size !== numbers.length) {
    throw new Error("Specify unique episode numbers with --numbers 1,127,224");
  }

  const archive = await fetchArchive();
  const byNumber = new Map(archive.map((episode) => [episode.number, episode]));
  const selected = numbers.map((number) => {
    const episode = byNumber.get(number);
    if (!episode) {
      throw new Error(`Episode #${number} was not found in the archive`);
    }
    return episode;
  });
  const resolved = await Promise.all(
    selected.map((episode) => resolveEpisodeCover(episode)),
  );
  const snapshotAt = new Date().toISOString();
  const selection = AdditionalSelectionSchema.parse({
    schemaVersion: 1,
    source: {
      type: "wordpress",
      apiUrl: ARCHIVE_API_URL,
      categoryId: ARCHIVE_CATEGORY_ID,
      snapshotAt,
    },
    selectionAlgorithm: "curated-extra-v1",
    episodes: resolved.map((episode) => ({
      year: episode.year,
      id: episode.id,
      sourceId: episode.sourceId,
      sourceGuid: episode.sourceGuid,
      slug: episode.slug,
      number: episode.number,
      publishedAt: episode.publishedAt,
      pageUrl: episode.pageUrl,
    })),
  });

  await writeJson(resolve(projectRoot, "data", "selection-extra.json"), selection);
  await Promise.all(
    resolved.map((episode) =>
      writeJson(
        resolve(projectRoot, "data", "episodes", episode.id, "metadata.json"),
        EpisodeMetadataSchema.parse(episode),
      ),
    ),
  );

  process.stdout.write(
    [
      `Selected ${resolved.length} additional episodes:`,
      ...resolved.map(
        (episode) =>
          `${episode.year}: #${episode.number} ${episode.title} (${episode.durationIso})`,
      ),
    ].join("\n") + "\n",
  );
}

await main();
