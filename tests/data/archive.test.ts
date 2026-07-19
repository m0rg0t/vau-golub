import { describe, expect, it, vi } from "vitest";

import {
  decodeHtmlEntities,
  parseArchivePost,
  parseIsoDuration,
  resolveEpisodeCover,
  seededYearIndex,
  type WordpressPost,
} from "../../scripts/lib/archive";

const archivePost: WordpressPost = {
  id: 13,
  date: "2015-12-25T17:46:31",
  slug: "02",
  link: "https://zavtracast.ru/02.html",
  guid: { rendered: "https://zavtracast.ru/?p=13" },
  title: { rendered: "Завтракаст №2 &#8211; Итоговый" },
  excerpt: { rendered: "<p>Первый абзац &amp; описание.</p>" },
  content: {
    rendered: [
      '<meta itemprop="duration" content="PT1H49M50S" />',
      '<meta itemprop="contentUrl" content="https://media.example/zavtracast-002.mp3" />',
      '<meta itemprop="thumbnailURL" content="https://zavtracast.ru/cover.jpg" />',
      "<ul><li>Тема один</li><li>Тема &amp; два</li></ul>",
    ].join(""),
  },
  featured_media: 0,
};

describe("archive parsing", () => {
  it("decodes named and numeric HTML entities", () => {
    expect(decodeHtmlEntities("A &amp; B &#8211; C")).toBe("A & B – C");
  });

  it("converts ISO podcast durations to seconds", () => {
    expect(parseIsoDuration("PT1H49M50S")).toBe(6590);
  });

  it("extracts old WordPress audio metadata without guessing file names", () => {
    expect(parseArchivePost(archivePost)).toMatchObject({
      id: "zc-02",
      number: 2,
      title: "Итоговый",
      year: 2015,
      durationSec: 6590,
      audioUrl: "https://media.example/zavtracast-002.mp3",
      showNotes: ["Тема один", "Тема & два"],
    });
  });

  it("uses a stable SHA-256 index for a year", () => {
    expect(seededYearIndex("zavtracast-sdvg:v1", 2015, 2)).toBe(1);
    expect(seededYearIndex("zavtracast-sdvg:v1", 2015, 2)).toBe(
      seededYearIndex("zavtracast-sdvg:v1", 2015, 2),
    );
  });

  it("prefers current featured media over a stale embedded thumbnail", async () => {
    const parsed = parseArchivePost({
      ...archivePost,
      featured_media: 1086,
    });
    expect(parsed).not.toBeNull();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        source_url: "https://zavtracast.ru/wp-content/uploads/current.jpg",
      }),
    );

    await expect(
      resolveEpisodeCover(parsed!, fetchMock),
    ).resolves.toMatchObject({
      coverSourceUrl:
        "https://zavtracast.ru/wp-content/uploads/current.jpg",
      localCoverPath: "/covers/zc-02.jpg",
    });
  });
});
