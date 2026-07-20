import { resolve } from "node:path";

import { readJson, writeJsonAtomic } from "./lib/files";
import { projectRoot } from "./lib/catalog";

// Origin the deployed site is served from. JSON-LD @id/url values and the
// absolute image URLs must all point here.
const SITE_ORIGIN = "https://vau-golub.ru";
const SERIES_ID = `${SITE_ORIGIN}/#zavtracast-series`;

// The public/data payloads emitted by scripts/build-playback-index.ts. We read
// the shipped artifacts (not the raw source under data/) so the structured data
// always mirrors what the site actually serves.
interface CatalogEpisode {
  id: string;
  number: number;
}

interface Catalog {
  episodes: CatalogEpisode[];
}

interface EpisodeMetadata {
  title: string;
  number: number;
  publishedAt: string;
  durationIso: string;
  pageUrl: string;
  audioUrl: string;
  summary: string;
  localCoverPath: string;
}

interface EpisodePayload {
  metadata: EpisodeMetadata;
}

// One schema.org PodcastEpisode node. Kept intentionally small — the per-episode
// public/data/episodes/<id>.json files carry full transcripts (~500 KB each),
// so we distil only the fields the structured data needs and cache them in a
// compact file the server component can import without bundling megabytes.
interface PodcastEpisodeNode {
  "@type": "PodcastEpisode";
  "@id": string;
  url: string;
  name: string;
  episodeNumber: number;
  datePublished: string;
  description: string;
  image: string;
  timeRequired: string;
  partOfSeries: { "@id": string };
  associatedMedia: {
    "@type": "AudioObject";
    contentUrl: string;
    duration: string;
    encodingFormat: "audio/mpeg";
  };
}

async function main(): Promise<void> {
  const catalog = (await readJson(
    resolve(projectRoot, "public", "data", "catalog.json"),
  )) as Catalog;

  const nodes: PodcastEpisodeNode[] = [];
  for (const { id } of catalog.episodes) {
    const { metadata } = (await readJson(
      resolve(projectRoot, "public", "data", "episodes", `${id}.json`),
    )) as EpisodePayload;

    nodes.push({
      "@type": "PodcastEpisode",
      "@id": `${SITE_ORIGIN}/#episode-${id}`,
      url: metadata.pageUrl,
      name: metadata.title,
      episodeNumber: metadata.number,
      datePublished: metadata.publishedAt,
      description: metadata.summary,
      image: `${SITE_ORIGIN}${metadata.localCoverPath}`,
      timeRequired: metadata.durationIso,
      partOfSeries: { "@id": SERIES_ID },
      associatedMedia: {
        "@type": "AudioObject",
        contentUrl: metadata.audioUrl,
        duration: metadata.durationIso,
        encodingFormat: "audio/mpeg",
      },
    });
  }

  await writeJsonAtomic(
    resolve(projectRoot, "src", "app", "episodes-jsonld.json"),
    nodes,
  );

  console.log(`Wrote ${nodes.length} PodcastEpisode nodes to src/app/episodes-jsonld.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
