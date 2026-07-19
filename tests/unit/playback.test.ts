import { describe, expect, it } from "vitest";

import {
  createPlaybackState,
  reducePlayback,
  type PlaybackEvent,
  type PlaybackItem,
  type PlaybackState,
  type PlaybackTransition,
} from "../../src/domain/playback";

const firstItem: PlaybackItem = {
  id: "topic-1",
  audioUrl: "https://example.com/episode.mp3",
  startSec: 120,
  endSec: 180,
};

function dispatch(
  state: PlaybackState,
  event: PlaybackEvent,
): PlaybackTransition {
  return reducePlayback(state, event);
}

function playingState(): PlaybackState {
  let state = createPlaybackState(0.8);
  state = dispatch(state, {
    type: "load-item",
    item: firstItem,
  }).state;
  state = dispatch(state, { type: "play" }).state;
  state = dispatch(state, {
    type: "metadata-ready",
    itemId: firstItem.id,
  }).state;
  state = dispatch(state, {
    type: "playing",
    itemId: firstItem.id,
  }).state;
  return state;
}

describe("range playback controller", () => {
  it("does not autoplay before the first user play intent", () => {
    const initial = createPlaybackState();
    const loaded = dispatch(initial, {
      type: "load-item",
      item: firstItem,
    });

    expect(loaded.state).toMatchObject({
      status: "loading",
      playIntent: false,
      currentTimeSec: 120,
    });
    expect(loaded.effects).toEqual([
      {
        type: "load",
        itemId: firstItem.id,
        audioUrl: firstItem.audioUrl,
      },
    ]);

    const ready = dispatch(loaded.state, {
      type: "metadata-ready",
      itemId: firstItem.id,
    });

    expect(ready.state.status).toBe("ready");
    expect(ready.effects).toEqual([{ type: "seek", timeSec: 120 }]);
  });

  it("remembers play before metadata and seeks before issuing play", () => {
    let state = dispatch(createPlaybackState(), {
      type: "load-item",
      item: firstItem,
    }).state;

    const intent = dispatch(state, { type: "play" });
    state = intent.state;
    expect(state.playIntent).toBe(true);
    expect(intent.effects).toEqual([]);

    const ready = dispatch(state, {
      type: "metadata-ready",
      itemId: firstItem.id,
    });
    expect(ready.effects).toEqual([
      { type: "seek", timeSec: firstItem.startSec },
      { type: "play" },
    ]);

    const playing = dispatch(ready.state, {
      type: "playing",
      itemId: firstItem.id,
    });
    expect(playing.state.status).toBe("playing");
  });

  it("stops exactly at the range end and requests one automatic advance", () => {
    let state = playingState();
    const beforeEnd = dispatch(state, {
      type: "time-update",
      itemId: firstItem.id,
      currentTimeSec: 179.8,
    });
    state = beforeEnd.state;
    expect(beforeEnd.effects).toEqual([]);

    const ended = dispatch(state, {
      type: "time-update",
      itemId: firstItem.id,
      currentTimeSec: 180.2,
    });
    state = ended.state;

    expect(state).toMatchObject({
      status: "paused",
      currentTimeSec: 180,
      playIntent: true,
      advancePending: true,
    });
    expect(ended.effects).toEqual([
      { type: "pause" },
      { type: "seek", timeSec: 180 },
      {
        type: "advance",
        itemId: firstItem.id,
        reason: "ended",
      },
    ]);

    const duplicate = dispatch(state, {
      type: "time-update",
      itemId: firstItem.id,
      currentTimeSec: 181,
    });
    expect(duplicate.effects).toEqual([]);
    expect(duplicate.state.advancePending).toBe(true);
  });

  it("pause cancels automatic continuation", () => {
    let state = playingState();
    const paused = dispatch(state, { type: "pause" });
    state = paused.state;

    expect(state).toMatchObject({
      status: "paused",
      playIntent: false,
    });
    expect(paused.effects).toEqual([{ type: "pause" }]);

    const lateUpdate = dispatch(state, {
      type: "time-update",
      itemId: firstItem.id,
      currentTimeSec: firstItem.endSec,
    });
    expect(lateUpdate.effects).toEqual([]);
    expect(lateUpdate.state.advancePending).toBe(false);

    const nextItem: PlaybackItem = {
      ...firstItem,
      id: "topic-2",
      startSec: 300,
      endSec: 360,
    };
    const loaded = dispatch(lateUpdate.state, {
      type: "load-item",
      item: nextItem,
    });
    const ready = dispatch(loaded.state, {
      type: "metadata-ready",
      itemId: nextItem.id,
    });
    expect(ready.effects).toEqual([{ type: "seek", timeSec: 300 }]);
  });

  it("preserves play intent while loading the item after an advance", () => {
    let state = playingState();
    state = dispatch(state, {
      type: "time-update",
      itemId: firstItem.id,
      currentTimeSec: firstItem.endSec,
    }).state;

    const nextItem: PlaybackItem = {
      ...firstItem,
      id: "topic-2",
      startSec: 400,
      endSec: 460,
    };
    const loaded = dispatch(state, {
      type: "load-item",
      item: nextItem,
    });
    const ready = dispatch(loaded.state, {
      type: "metadata-ready",
      itemId: nextItem.id,
    });

    expect(loaded.state.playIntent).toBe(true);
    expect(loaded.state.advancePending).toBe(false);
    expect(ready.effects).toEqual([
      { type: "seek", timeSec: 400 },
      { type: "play" },
    ]);
  });

  it("reports media errors without advancing and retries the same item", () => {
    const state = playingState();
    const failed = dispatch(state, {
      type: "media-error",
      itemId: firstItem.id,
      message: "network",
    });

    expect(failed.state).toMatchObject({
      status: "error",
      item: firstItem,
      playIntent: true,
      error: "network",
    });
    expect(failed.effects).toEqual([]);

    const retried = dispatch(failed.state, { type: "retry" });
    expect(retried.state).toMatchObject({
      status: "loading",
      item: firstItem,
      currentTimeSec: firstItem.startSec,
      playIntent: true,
      error: null,
    });
    expect(retried.effects).toEqual([
      {
        type: "load",
        itemId: firstItem.id,
        audioUrl: firstItem.audioUrl,
      },
    ]);
  });

  it("advances only on an explicit skip after an error", () => {
    const failed = dispatch(playingState(), {
      type: "media-error",
      itemId: firstItem.id,
      message: "network",
    });
    const skipped = dispatch(failed.state, { type: "skip" });

    expect(skipped.state.advancePending).toBe(true);
    expect(skipped.effects).toEqual([
      {
        type: "advance",
        itemId: firstItem.id,
        reason: "skip",
      },
    ]);
  });

  it("clamps seeks to the active range", () => {
    let state = playingState();

    const before = dispatch(state, { type: "seek", timeSec: 5 });
    state = before.state;
    expect(before.state.currentTimeSec).toBe(120);
    expect(before.effects).toEqual([{ type: "seek", timeSec: 120 }]);

    const after = dispatch(state, { type: "seek", timeSec: 999 });
    expect(after.state.currentTimeSec).toBe(180);
    expect(after.effects).toEqual([{ type: "seek", timeSec: 180 }]);
  });

  it("clamps volume and returns an element update effect", () => {
    let state = createPlaybackState(0.5);
    const muted = dispatch(state, { type: "set-volume", volume: -1 });
    state = muted.state;
    expect(state.volume).toBe(0);
    expect(muted.effects).toEqual([{ type: "set-volume", volume: 0 }]);

    const loud = dispatch(state, { type: "set-volume", volume: 2 });
    expect(loud.state.volume).toBe(1);
    expect(loud.effects).toEqual([{ type: "set-volume", volume: 1 }]);
  });

  it("ignores stale media events from the previous item", () => {
    const loaded = dispatch(createPlaybackState(), {
      type: "load-item",
      item: firstItem,
    });

    const staleMetadata = dispatch(loaded.state, {
      type: "metadata-ready",
      itemId: "old-item",
    });
    const staleError = dispatch(staleMetadata.state, {
      type: "media-error",
      itemId: "old-item",
      message: "stale",
    });

    expect(staleMetadata.effects).toEqual([]);
    expect(staleError.effects).toEqual([]);
    expect(staleError.state).toBe(loaded.state);
  });
});
