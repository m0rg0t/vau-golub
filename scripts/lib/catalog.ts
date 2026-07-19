import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  EpisodeMetadataSchema,
  AdditionalSelectionSchema,
  SelectionSchema,
  type EpisodeMetadata,
} from "../../src/domain/schema";

export const projectRoot = resolve(import.meta.dirname, "../..");

async function loadAdditionalEpisodes(): Promise<
  Array<{ id: string }>
> {
  try {
    const additional = AdditionalSelectionSchema.parse(
      JSON.parse(
        await readFile(
          resolve(projectRoot, "data", "selection-extra.json"),
          "utf8",
        ),
      ),
    );
    return additional.episodes;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function loadSelectedEpisodes(
  requestedId?: string | null,
): Promise<EpisodeMetadata[]> {
  const selection = SelectionSchema.parse(
    JSON.parse(
      await readFile(resolve(projectRoot, "data", "selection.json"), "utf8"),
    ),
  );
  const episodes = [
    ...selection.episodes,
    ...(await loadAdditionalEpisodes()),
  ];
  const selected = requestedId
    ? episodes.filter((episode) => episode.id === requestedId)
    : episodes;

  if (requestedId && selected.length === 0) {
    throw new Error(`Unknown selected episode: ${requestedId}`);
  }

  return Promise.all(
    selected.map(async ({ id }) =>
      EpisodeMetadataSchema.parse(
        JSON.parse(
          await readFile(
            resolve(projectRoot, "data", "episodes", id, "metadata.json"),
            "utf8",
          ),
        ),
      ),
    ),
  );
}
