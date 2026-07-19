import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  EpisodeMetadataSchema,
  SelectionSchema,
} from "../../src/domain/schema";

const expectedNumbers = [2, 8, 48, 115, 167, 193, 211, 267, 292, 330, 360, 374];

describe("committed starter selection", () => {
  it("contains the approved deterministic episode for every year", async () => {
    const selection = SelectionSchema.parse(
      JSON.parse(await readFile("data/selection.json", "utf8")),
    );

    expect(selection.years).toEqual(
      Array.from({ length: 12 }, (_, index) => 2015 + index),
    );
    expect(selection.episodes.map((episode) => episode.number)).toEqual(
      expectedNumbers,
    );
    expect(new Set(selection.episodes.map((episode) => episode.year)).size).toBe(
      12,
    );
  });

  it("validates each selected episode metadata file", async () => {
    const selection = SelectionSchema.parse(
      JSON.parse(await readFile("data/selection.json", "utf8")),
    );

    const metadata = await Promise.all(
      selection.episodes.map(async (episode) =>
        EpisodeMetadataSchema.parse(
          JSON.parse(
            await readFile(
              `data/episodes/${episode.id}/metadata.json`,
              "utf8",
            ),
          ),
        ),
      ),
    );

    expect(metadata).toHaveLength(12);
    expect(metadata.every((episode) => episode.audioUrl.endsWith(".mp3"))).toBe(
      true,
    );
    expect(metadata.every((episode) => episode.durationSec > 60 * 60)).toBe(true);
  });
});
