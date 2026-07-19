export type ListeningMode = "topics" | "minute";

export interface CatalogEpisode {
  id: string;
  number: number;
  title: string;
  year: number;
  publishedAt: string;
  localCoverPath: string;
  dataPath: string;
  topicCount: number;
  minuteClipCount: number;
}

export interface CatalogItem {
  id: string;
  episodeId: string;
  kind: "topic" | "minute";
  title: string;
  description: string;
  startSec: number;
  endSec: number;
}

export interface Catalog {
  schemaVersion: 1;
  fingerprint: string;
  episodes: CatalogEpisode[];
  items: {
    topics: CatalogItem[];
    minute: CatalogItem[];
  };
}

export interface TranscriptPhrase {
  id: string;
  index: number;
  startSec: number;
  endSec: number;
  text: string;
  complete: boolean;
}

export interface EpisodeData {
  schemaVersion: 1;
  metadata: {
    id: string;
    number: number;
    title: string;
    publishedAt: string;
    year: number;
    durationSec: number;
    pageUrl: string;
    localCoverPath: string;
    audioUrl: string;
    summary: string;
    showNotes: string[];
  };
  transcript: {
    episodeId: string;
    phrases: TranscriptPhrase[];
  };
}
