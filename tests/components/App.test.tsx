// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/app/App";
import type { Catalog, EpisodeData } from "../../src/app/types";

const catalog: Catalog = {
  schemaVersion: 1,
  fingerprint: "test-catalog",
  episodes: [
    {
      id: "zc-02",
      number: 2,
      title: "Итоговый",
      year: 2015,
      publishedAt: "2015-12-25T17:46:31+03:00",
      localCoverPath: "/covers/zc-02.jpg",
      dataPath: "/data/episodes/zc-02.json",
      topicCount: 1,
      minuteClipCount: 1,
    },
  ],
  items: {
    topics: [
      {
        id: "topic-1",
        episodeId: "zc-02",
        kind: "topic",
        title: "Скандал года",
        description: "Кодзима и Конами подводят итоги.",
        startSec: 60,
        endSec: 180,
      },
    ],
    minute: [
      {
        id: "minute-1",
        episodeId: "zc-02",
        kind: "minute",
        title: "Минута 1",
        description: "Одна законченная мысль.",
        startSec: 200,
        endSec: 260,
      },
    ],
  },
};

const episode: EpisodeData = {
  schemaVersion: 1,
  metadata: {
    id: "zc-02",
    number: 2,
    title: "Итоговый",
    publishedAt: "2015-12-25T17:46:31+03:00",
    year: 2015,
    durationSec: 6590,
    pageUrl: "https://zavtracast.ru/02.html",
    localCoverPath: "/covers/zc-02.jpg",
    audioUrl: "https://example.com/episode.mp3",
    summary: "Итоги года.",
    showNotes: [],
  },
  transcript: {
    episodeId: "zc-02",
    phrases: [
      {
        id: "phrase-1",
        index: 0,
        startSec: 60,
        endSec: 90,
        text: "Сегодня подводим итоги года.",
        complete: true,
      },
    ],
  },
};

describe("radio app", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        const payload = url.endsWith("catalog.json") ? catalog : episode;
        return Promise.resolve(
          new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads a real catalog item and switches listening modes", async () => {
    render(<App />);

    expect(screen.getByText("Перебираем годы, темы и голубей…")).toBeVisible();
    expect(
      await screen.findByRole("heading", { name: "Скандал года" }),
    ).toBeVisible();
    expect(
      await screen.findByText("Сегодня подводим итоги года."),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Одна минута" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Минута 1" }),
      ).toBeVisible();
    });
    expect(window.localStorage.getItem(`${STORAGE_PREFIX}:mode`)).toBe(
      "minute",
    );
  });

  it("opens source details and the full transcript", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Скандал года" });
    await screen.findByText("Сегодня подводим итоги года.");

    fireEvent.click(
      screen.getByRole("button", { name: "Откуда этот фрагмент?" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Итоговый" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Закрыть информацию" }));
    fireEvent.click(screen.getByRole("button", { name: "Вся расшифровка" }));
    expect(
      screen.getByRole("dialog", { name: "Итоговый" }),
    ).toBeVisible();
    expect(
      screen.getAllByText("Сегодня подводим итоги года.").at(-1),
    ).toBeVisible();
  });
});

const STORAGE_PREFIX = "zavtracast-sdvg:v1";
