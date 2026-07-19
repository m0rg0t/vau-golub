import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  EpisodeMetadataSchema,
  SelectionSchema,
  type EpisodeMetadata,
} from "../../src/domain/schema";

export const projectRoot = resolve(import.meta.dirname, "../..");

export async function loadSelectedEpisodes(
  requestedId?: string | null,
): Promise<EpisodeMetadata[]> {
  const selection = SelectionSchema.parse(
    JSON.parse(
      await readFile(resolve(projectRoot, "data", "selection.json"), "utf8"),
    ),
  );
  const selected = requestedId
    ? selection.episodes.filter((episode) => episode.id === requestedId)
    : selection.episodes;

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
