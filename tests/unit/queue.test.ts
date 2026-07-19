import { describe, expect, it } from "vitest";

import {
  advanceQueue,
  canGoBack,
  canGoForward,
  createQueueState,
  createSeededRandom,
  currentQueueItem,
  fisherYatesShuffle,
  restoreQueueState,
  rewindQueue,
  type QueueDataset,
} from "../../src/domain/queue";

const dataset: QueueDataset<string> = {
  fingerprint: "catalog-v1",
  items: ["a", "b", "c", "d"],
};

describe("persistent random queue", () => {
  it("produces deterministic Fisher–Yates shuffles without mutating input", () => {
    const input = ["a", "b", "c", "d"];

    expect(fisherYatesShuffle(input, createSeededRandom("same-seed"))).toEqual(
      fisherYatesShuffle(input, createSeededRandom("same-seed")),
    );
    expect(input).toEqual(["a", "b", "c", "d"]);
  });

  it("visits every item once before starting a new cycle", () => {
    const random = createSeededRandom("unique-cycle");
    let state = createQueueState(dataset, random);
    const firstCycle = [currentQueueItem(state)];

    for (let index = 1; index < dataset.items.length; index += 1) {
      state = advanceQueue(state, dataset, random);
      firstCycle.push(currentQueueItem(state));
    }

    expect(new Set(firstCycle)).toEqual(new Set(dataset.items));
    expect(state.remaining).toEqual([]);
  });

  it("does not repeat the final item at a cycle boundary", () => {
    const random = createSeededRandom("cycle-boundary");
    let state = createQueueState(dataset, random);

    for (let index = 1; index < dataset.items.length; index += 1) {
      state = advanceQueue(state, dataset, random);
    }

    const previous = currentQueueItem(state);
    state = advanceQueue(state, dataset, random);
    const secondCycle = [currentQueueItem(state)];

    expect(secondCycle[0]).not.toBe(previous);

    for (let index = 1; index < dataset.items.length; index += 1) {
      state = advanceQueue(state, dataset, random);
      secondCycle.push(currentQueueItem(state));
    }

    expect(new Set(secondCycle)).toEqual(new Set(dataset.items));
  });

  it("moves backward and forward through history without consuming the queue", () => {
    const random = createSeededRandom("history");
    let state = createQueueState(dataset, random);
    state = advanceQueue(state, dataset, random);
    state = advanceQueue(state, dataset, random);
    const latest = currentQueueItem(state);
    const remaining = [...state.remaining];
    const history = [...state.history];

    state = rewindQueue(state);
    expect(canGoBack(state)).toBe(true);
    expect(canGoForward(state)).toBe(true);
    expect(currentQueueItem(state)).toBe(history[1]);

    state = advanceQueue(state, dataset, random);
    expect(currentQueueItem(state)).toBe(latest);
    expect(state.remaining).toEqual(remaining);
    expect(state.history).toEqual(history);
  });

  it("restores history and position from a JSON snapshot", () => {
    const random = createSeededRandom("persist");
    let state = createQueueState(dataset, random);
    state = advanceQueue(state, dataset, random);
    state = advanceQueue(state, dataset, random);
    state = rewindQueue(state);

    const restored = restoreQueueState(
      dataset,
      JSON.parse(JSON.stringify(state)) as unknown,
      createSeededRandom("unused"),
    );

    expect(restored).toEqual(state);
    expect(currentQueueItem(restored)).toBe(currentQueueItem(state));
    expect(restored).not.toBe(state);
    expect(restored.history).not.toBe(state.history);
  });

  it("starts fresh when the dataset fingerprint changes", () => {
    const oldState = createQueueState(dataset, createSeededRandom("old"));
    const nextDataset = {
      fingerprint: "catalog-v2",
      items: ["new-a", "new-b", "new-c"],
    };

    const restored = restoreQueueState(
      nextDataset,
      oldState,
      createSeededRandom("new"),
    );

    expect(restored.datasetFingerprint).toBe("catalog-v2");
    expect(restored.history).toHaveLength(1);
    expect(nextDataset.items).toContain(currentQueueItem(restored));
    expect(restored.history).not.toContain(currentQueueItem(oldState));
  });

  it("keeps topic and minute queues independent", () => {
    const topics = {
      fingerprint: "catalog-v1",
      items: ["topic-1", "topic-2", "topic-3"],
    };
    const minutes = {
      fingerprint: "catalog-v1",
      items: ["minute-1", "minute-2", "minute-3"],
    };
    const topicRandom = createSeededRandom("topics");
    const minuteRandom = createSeededRandom("minutes");
    let topicState = createQueueState(topics, topicRandom);
    const minuteState = createQueueState(minutes, minuteRandom);

    topicState = advanceQueue(topicState, topics, topicRandom);

    expect(topicState.history).toHaveLength(2);
    expect(minuteState.history).toHaveLength(1);
    expect(currentQueueItem(minuteState)).toMatch(/^minute-/);
  });

  it("rejects duplicate datasets and invalid random sources", () => {
    expect(() =>
      createQueueState(
        { fingerprint: "duplicate", items: ["same", "same"] },
        createSeededRandom("duplicate"),
      ),
    ).toThrow("Queue items must be unique");

    expect(() =>
      fisherYatesShuffle(["a", "b"], () => 1),
    ).toThrow("Random source");
  });
});
