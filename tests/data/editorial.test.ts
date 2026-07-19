import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { validateEpisodeData } from "../../scripts/lib/editorial";
import type { Phrase } from "../../src/domain/schema";

function phrase(index: number): Phrase {
  return {
    id: `zc-02-p-${String(index).padStart(5, "0")}`,
    index,
    sourceSegmentStart: index,
    sourceSegmentEnd: index,
    startSec: index * 15,
    endSec: index * 15 + 15,
    text: `Фраза ${index}.`,
    complete: true,
  };
}

async function fixture() {
  const metadata = JSON.parse(
    await readFile("data/episodes/zc-02/metadata.json", "utf8"),
  );
  const phrases = Array.from({ length: 8 }, (_, index) => phrase(index));
  const transcript = {
    schemaVersion: 1,
    episodeId: "zc-02",
    language: "ru",
    model: "test",
    sourceSegmentCount: phrases.length,
    phrases,
  };
  const editorial = {
    schemaVersion: 1,
    episodeId: "zc-02",
    topics: [
      {
        id: "topic-1",
        title: "Тестовая тема",
        summary: "Содержательная тестовая тема.",
        startPhraseId: phrases[0].id,
        endPhraseId: phrases[3].id,
        startSec: phrases[0].startSec,
        endSec: phrases[3].endSec,
      },
    ],
    exclusions: [
      {
        id: "ad-1",
        kind: "ad",
        reason: "Тестовая реклама",
        startPhraseId: phrases[6].id,
        endPhraseId: phrases[7].id,
        startSec: phrases[6].startSec,
        endSec: phrases[7].endSec,
      },
    ],
  };
  return { metadata, transcript, editorial };
}

describe("editorial validation", () => {
  it("validates phrase-bound ranges and builds sentence clips", async () => {
    const data = await fixture();
    const validated = validateEpisodeData(
      data.metadata,
      data.transcript,
      data.editorial,
    );

    expect(validated.minuteClips).toHaveLength(1);
    expect(validated.minuteClips[0].durationSec).toBe(60);
  });

  it("rejects editorial timestamps inside a phrase", async () => {
    const data = await fixture();
    data.editorial.topics[0].startSec = 1;

    expect(() =>
      validateEpisodeData(
        data.metadata,
        data.transcript,
        data.editorial,
      ),
    ).toThrow("timestamps must equal phrase boundaries");
  });

  it("rejects a topic crossing an excluded range", async () => {
    const data = await fixture();
    data.editorial.exclusions[0] = {
      ...data.editorial.exclusions[0],
      startPhraseId: data.transcript.phrases[2].id,
      endPhraseId: data.transcript.phrases[3].id,
      startSec: data.transcript.phrases[2].startSec,
      endSec: data.transcript.phrases[3].endSec,
    };

    expect(() =>
      validateEpisodeData(
        data.metadata,
        data.transcript,
        data.editorial,
      ),
    ).toThrow("intersects exclusion");
  });
});
