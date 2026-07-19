import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

import {
  EpisodeMetadataSchema,
  SelectionSchema,
  type EpisodeMetadata,
  type EpisodeSelection,
} from "../src/domain/schema";
import {
  ARCHIVE_API_URL,
  ARCHIVE_CATEGORY_ID,
  ARCHIVE_YEARS,
  fetchArchive,
  resolveEpisodeCover,
  selectOnePerYear,
} from "./lib/archive";

const DEFAULT_SEED = "zavtracast-sdvg:v1";
const projectRoot = resolve(import.meta.dirname, "..");
const selectionPath = resolve(projectRoot, "data", "selection.json");

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function stableSelection(selection: EpisodeSelection) {
  return {
    seed: selection.seed,
    selectionAlgorithm: selection.selectionAlgorithm,
    years: selection.years,
    eligibleCountsByYear: selection.eligibleCountsByYear,
    episodes: selection.episodes,
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const seed = argumentValue("--seed") ?? DEFAULT_SEED;
  const checkOnly = process.argv.includes("--check");
  const archive = await fetchArchive();
  const selected = await Promise.all(
    selectOnePerYear(archive, seed).map((episode) =>
      resolveEpisodeCover(episode),
    ),
  );
  const snapshotAt = new Date().toISOString();

  const eligibleCountsByYear = Object.fromEntries(
    ARCHIVE_YEARS.map((year) => [
      String(year),
      archive.filter((episode) => episode.year === year).length,
    ]),
  );

  const selection = SelectionSchema.parse({
    schemaVersion: 1,
    source: {
      type: "wordpress",
      apiUrl: ARCHIVE_API_URL,
      categoryId: ARCHIVE_CATEGORY_ID,
      snapshotAt,
    },
    seed,
    selectionAlgorithm: "one-per-year-v1",
    years: ARCHIVE_YEARS,
    eligibleCountsByYear,
    episodes: selected.map((episode) => ({
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

  const metadata = selected.map((episode) =>
    EpisodeMetadataSchema.parse(episode),
  );

  if (checkOnly) {
    const committed = SelectionSchema.parse(
      JSON.parse(await readFile(selectionPath, "utf8")),
    );
    if (
      JSON.stringify(stableSelection(committed)) !==
      JSON.stringify(stableSelection(selection))
    ) {
      throw new Error(
        "Committed selection no longer matches the source archive and seed",
      );
    }
    process.stdout.write(
      `Selection is reproducible: ${committed.episodes.map((episode) => episode.number).join(", ")}\n`,
    );
    return;
  }

  await writeJson(selectionPath, selection);
  await Promise.all(
    metadata.map((episode: EpisodeMetadata) =>
      writeJson(
        resolve(projectRoot, "data", "episodes", episode.id, "metadata.json"),
        episode,
      ),
    ),
  );

  process.stdout.write(
    [
      `Selected ${metadata.length} episodes with seed "${seed}":`,
      ...metadata.map(
        (episode) =>
          `${episode.year}: #${episode.number} ${episode.title} (${episode.durationIso})`,
      ),
    ].join("\n") + "\n",
  );
}

await main();
