import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  EpisodeMetadataSchema,
  SelectionSchema,
  type EpisodeMetadata,
} from "../src/domain/schema";

const projectRoot = resolve(import.meta.dirname, "..");

export async function verifyAudioRange(
  episode: EpisodeMetadata,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImplementation(episode.audioUrl, {
    headers: { Range: "bytes=0-1023" },
    redirect: "follow",
  });
  const contentType = response.headers.get("content-type") ?? "";
  const contentRange = response.headers.get("content-range") ?? "";
  const bytes = new Uint8Array(await response.arrayBuffer());

  if (response.status !== 206) {
    throw new Error(
      `${episode.id}: expected HTTP 206 for a range request, got ${response.status}`,
    );
  }
  if (!contentType.toLowerCase().includes("audio")) {
    throw new Error(
      `${episode.id}: expected an audio content type, got "${contentType}"`,
    );
  }
  if (!/^bytes 0-1023\/\d+$/.test(contentRange)) {
    throw new Error(
      `${episode.id}: unexpected Content-Range "${contentRange}"`,
    );
  }
  if (bytes.byteLength !== 1024) {
    throw new Error(
      `${episode.id}: expected 1024 response bytes, got ${bytes.byteLength}`,
    );
  }
}

async function main(): Promise<void> {
  const selection = SelectionSchema.parse(
    JSON.parse(
      await readFile(resolve(projectRoot, "data", "selection.json"), "utf8"),
    ),
  );
  const episodes = await Promise.all(
    selection.episodes.map(async ({ id }) =>
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

  for (const episode of episodes) {
    await verifyAudioRange(episode);
    process.stdout.write(
      `✓ ${episode.year} #${episode.number}: ${episode.audioUrl}\n`,
    );
  }
}

if (import.meta.main) {
  await main();
}
