import { createHash } from "node:crypto";

import {
  EpisodeMetadataSchema,
  type EpisodeMetadata,
} from "../../src/domain/schema";

export const ARCHIVE_API_URL = "https://zavtracast.ru/wp-json/wp/v2/posts";
export const ARCHIVE_CATEGORY_ID = 2;
export const ARCHIVE_YEARS = Array.from(
  { length: 12 },
  (_, index) => 2015 + index,
);

type WordpressRendered = {
  rendered: string;
};

export type WordpressPost = {
  id: number;
  date: string;
  link: string;
  slug: string;
  guid: WordpressRendered;
  title: WordpressRendered;
  content: WordpressRendered;
  excerpt: WordpressRendered;
  featured_media: number;
};

export type ArchiveEpisode = Omit<
  EpisodeMetadata,
  "coverSourceUrl" | "localCoverPath" | "durationIso" | "durationSec"
> & {
  coverSourceUrl: string | null;
  localCoverPath: string | null;
  durationIso: string | null;
  durationSec: number | null;
  featuredMediaId: number;
  sourceDate: string;
};

async function fetchWithRetry(
  url: URL,
  fetchImplementation: typeof fetch,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImplementation(url);
      if (
        response.ok ||
        (response.status !== 429 && response.status < 500)
      ) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) {
      await new Promise((resolveDelay) =>
        setTimeout(resolveDelay, 2 ** (attempt - 1) * 500),
      );
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Request failed for ${url}`);
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  laquo: "«",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  raquo: "»",
};

export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      if (code.startsWith("#x") || code.startsWith("#X")) {
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      }
      if (code.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
      }
      return HTML_ENTITIES[code.toLowerCase()] ?? entity;
    },
  );
}

export function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<(?:br|\/p|\/li|\/h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractMetaContent(html: string, itemprop: string): string | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    const property = tag.match(/\bitemprop=["']([^"']+)["']/i)?.[1];
    if (property !== itemprop) {
      continue;
    }

    const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
    return content ? decodeHtmlEntities(content) : null;
  }

  return null;
}

export function parseIsoDuration(duration: string): number {
  const match = duration.match(
    /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );
  if (!match) {
    throw new Error(`Unsupported duration: ${duration}`);
  }

  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0)
  );
}

function extractShowNotes(html: string): string[] {
  return [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => htmlToText(match[1]))
    .filter(Boolean);
}

function extractDurationIso(html: string): string | null {
  const metadataDuration = extractMetaContent(html, "duration");
  if (metadataDuration) {
    return metadataDuration;
  }

  const match = html.match(/Duration:\s*(?:(\d+):)?(\d{1,2}):(\d{2})/i);
  if (!match) {
    return null;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${seconds}S`;
}

function coverExtension(url: string): "jpg" | "jpeg" | "png" | "webp" {
  const pathname = new URL(url).pathname.toLowerCase();
  const extension = pathname.match(/\.(jpg|jpeg|png|webp)$/)?.[1];
  return (extension as "jpg" | "jpeg" | "png" | "webp" | undefined) ?? "jpg";
}

export function parseArchivePost(post: WordpressPost): ArchiveEpisode | null {
  const pathname = new URL(post.link).pathname;
  if (!/\/\d+(?:-\d+)?\.html$/.test(pathname)) {
    return null;
  }

  const rawTitle = decodeHtmlEntities(post.title.rendered);
  if (!/З[ао]втракаст/i.test(rawTitle)) {
    return null;
  }

  const audioUrl = extractMetaContent(post.content.rendered, "contentUrl");
  const coverSourceUrl = extractMetaContent(
    post.content.rendered,
    "thumbnailURL",
  );
  const durationIso = extractDurationIso(post.content.rendered);
  if (!audioUrl) {
    return null;
  }

  const slug = post.slug;
  const number = Number.parseInt(slug.split("-")[0], 10);
  const sourceDate = post.date;
  const year = Number.parseInt(sourceDate.slice(0, 4), 10);
  const id = `zc-${slug}`;
  const title = rawTitle
    .replace(/^З[ао]втракаст\s*(?:№|#)?\s*\d+(?:-\d+)?\s*[—–-]?\s*/i, "")
    .trim();
  const showNotes = extractShowNotes(post.content.rendered);
  const summary =
    htmlToText(post.excerpt.rendered) ||
    extractMetaContent(post.content.rendered, "description") ||
    title;

  return {
    schemaVersion: 1,
    id,
    sourceId: post.id,
    sourceGuid: decodeHtmlEntities(post.guid.rendered),
    slug,
    number,
    title,
    publishedAt: `${sourceDate}+03:00`,
    year,
    durationIso,
    durationSec: durationIso ? parseIsoDuration(durationIso) : null,
    pageUrl: post.link,
    coverSourceUrl,
    localCoverPath: coverSourceUrl
      ? `/covers/${id}.${coverExtension(coverSourceUrl)}`
      : null,
    audioUrl,
    summary,
    showNotes,
    featuredMediaId: post.featured_media,
    sourceDate,
  };
}

export async function fetchArchive(
  fetchImplementation: typeof fetch = fetch,
): Promise<ArchiveEpisode[]> {
  const fields = [
    "id",
    "date",
    "link",
    "slug",
    "guid",
    "title",
    "content",
    "excerpt",
    "featured_media",
  ].join(",");
  const firstUrl = new URL(ARCHIVE_API_URL);
  firstUrl.searchParams.set("categories", String(ARCHIVE_CATEGORY_ID));
  firstUrl.searchParams.set("per_page", "100");
  firstUrl.searchParams.set("page", "1");
  firstUrl.searchParams.set("_fields", fields);

  const firstResponse = await fetchWithRetry(firstUrl, fetchImplementation);
  if (!firstResponse.ok) {
    throw new Error(`Archive request failed: ${firstResponse.status}`);
  }

  const totalPages = Number(firstResponse.headers.get("x-wp-totalpages") ?? 1);
  const posts = (await firstResponse.json()) as WordpressPost[];

  for (let page = 2; page <= totalPages; page += 1) {
    const pageUrl = new URL(firstUrl);
    pageUrl.searchParams.set("page", String(page));
    const response = await fetchWithRetry(pageUrl, fetchImplementation);
    if (!response.ok) {
      throw new Error(`Archive page ${page} failed: ${response.status}`);
    }
    posts.push(...((await response.json()) as WordpressPost[]));
  }

  return posts
    .map(parseArchivePost)
    .filter((episode): episode is ArchiveEpisode => episode !== null);
}

export async function resolveEpisodeCover(
  episode: ArchiveEpisode,
  fetchImplementation: typeof fetch = fetch,
): Promise<EpisodeMetadata & { sourceDate: string }> {
  if (!episode.durationIso || !episode.durationSec) {
    throw new Error(`Selected episode ${episode.id} has no source duration`);
  }

  if (!episode.featuredMediaId) {
    if (!episode.coverSourceUrl || !episode.localCoverPath) {
      throw new Error(`Episode ${episode.id} has no cover or featured media`);
    }
    return {
      ...EpisodeMetadataSchema.parse(episode),
      sourceDate: episode.sourceDate,
    };
  }

  const mediaUrl = new URL(
    `https://zavtracast.ru/wp-json/wp/v2/media/${episode.featuredMediaId}`,
  );
  mediaUrl.searchParams.set("_fields", "source_url");
  const response = await fetchWithRetry(mediaUrl, fetchImplementation);
  if (!response.ok) {
    throw new Error(
      `Cover request for ${episode.id} failed: ${response.status}`,
    );
  }

  const payload = (await response.json()) as { source_url?: string };
  if (!payload.source_url) {
    throw new Error(`Featured media for ${episode.id} has no source URL`);
  }

  return {
    ...EpisodeMetadataSchema.parse({
      ...episode,
      coverSourceUrl: payload.source_url,
      localCoverPath: `/covers/${episode.id}.${coverExtension(payload.source_url)}`,
    }),
    sourceDate: episode.sourceDate,
  };
}

export function seededYearIndex(seed: string, year: number, count: number): number {
  if (count <= 0) {
    throw new Error(`Cannot select from empty year ${year}`);
  }

  const digest = createHash("sha256")
    .update(`${seed}:${year}`)
    .digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16) % count;
}

export function selectOnePerYear(
  episodes: ArchiveEpisode[],
  seed: string,
): ArchiveEpisode[] {
  return ARCHIVE_YEARS.map((year) => {
    const candidates = episodes
      .filter((episode) => episode.year === year)
      .sort(
        (left, right) =>
          left.sourceDate.localeCompare(right.sourceDate) ||
          left.pageUrl.localeCompare(right.pageUrl),
      );

    return candidates[seededYearIndex(seed, year, candidates.length)];
  });
}
