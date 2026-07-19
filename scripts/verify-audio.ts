import { loadSelectedEpisodes } from "./lib/catalog";
import type { EpisodeMetadata } from "../src/domain/schema";

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
  const episodes = await loadSelectedEpisodes();

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
