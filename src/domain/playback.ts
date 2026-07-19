const RANGE_END_EPSILON_SEC = 0.01;

export type PlaybackStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "error";

export interface PlaybackItem {
  id: string;
  audioUrl: string;
  startSec: number;
  endSec: number;
}

export interface PlaybackState {
  status: PlaybackStatus;
  item: PlaybackItem | null;
  /**
   * Remembers a user-initiated desire to listen. It is deliberately false on
   * first load, and remains true across an automatic advance until the user
   * pauses.
   */
  playIntent: boolean;
  metadataReady: boolean;
  currentTimeSec: number;
  volume: number;
  /**
   * Prevents repeated timeupdate events at the range boundary from requesting
   * more than one queue advance.
   */
  advancePending: boolean;
  error: string | null;
}

export type PlaybackEvent =
  | {
      type: "load-item";
      item: PlaybackItem;
      /**
       * Override only for an explicit context change. By default the current
       * intent is preserved, which enables continuous playback after advance.
       */
      playIntent?: boolean;
    }
  | { type: "play" }
  | { type: "metadata-ready"; itemId: string }
  | { type: "playing"; itemId: string }
  | { type: "pause" }
  | { type: "time-update"; itemId: string; currentTimeSec: number }
  | { type: "seek"; timeSec: number }
  | { type: "set-volume"; volume: number }
  | { type: "media-error"; itemId: string; message: string }
  | { type: "retry" }
  | { type: "skip" };

export type PlaybackEffect =
  | { type: "load"; itemId: string; audioUrl: string }
  | { type: "seek"; timeSec: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "advance"; itemId: string; reason: "ended" | "skip" }
  | { type: "set-volume"; volume: number };

export interface PlaybackTransition {
  state: PlaybackState;
  effects: PlaybackEffect[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    throw new Error("Volume must be a finite number");
  }

  return clamp(volume, 0, 1);
}

function assertPlaybackItem(item: PlaybackItem): void {
  if (item.id.length === 0) {
    throw new Error("Playback item id must not be empty");
  }
  if (item.audioUrl.length === 0) {
    throw new Error("Playback item audioUrl must not be empty");
  }
  if (
    !Number.isFinite(item.startSec) ||
    !Number.isFinite(item.endSec) ||
    item.startSec < 0 ||
    item.startSec >= item.endSec
  ) {
    throw new Error(
      "Playback range must satisfy 0 <= startSec < endSec",
    );
  }
}

function unchanged(state: PlaybackState): PlaybackTransition {
  return { state, effects: [] };
}

function belongsToCurrentItem(
  state: PlaybackState,
  itemId: string,
): state is PlaybackState & { item: PlaybackItem } {
  return state.item?.id === itemId;
}

function shouldPauseElement(state: PlaybackState): boolean {
  return (
    state.status === "playing" ||
    (state.metadataReady && state.playIntent)
  );
}

export function createPlaybackState(volume = 1): PlaybackState {
  return {
    status: "idle",
    item: null,
    playIntent: false,
    metadataReady: false,
    currentTimeSec: 0,
    volume: clampVolume(volume),
    advancePending: false,
    error: null,
  };
}

/**
 * Pure playback controller. The caller performs the returned effects in order
 * and feeds media callbacks back as events.
 */
export function reducePlayback(
  state: PlaybackState,
  event: PlaybackEvent,
): PlaybackTransition {
  switch (event.type) {
    case "load-item": {
      assertPlaybackItem(event.item);
      const playIntent = event.playIntent ?? state.playIntent;

      return {
        state: {
          ...state,
          status: "loading",
          item: { ...event.item },
          playIntent,
          metadataReady: false,
          currentTimeSec: event.item.startSec,
          advancePending: false,
          error: null,
        },
        effects: [
          {
            type: "load",
            itemId: event.item.id,
            audioUrl: event.item.audioUrl,
          },
        ],
      };
    }

    case "play": {
      if (state.item === null || state.status === "error") {
        return unchanged(state);
      }
      if (state.playIntent && state.status === "playing") {
        return unchanged(state);
      }

      return {
        state: {
          ...state,
          playIntent: true,
          status:
            state.metadataReady && state.status === "paused"
              ? "ready"
              : state.status,
        },
        effects: state.metadataReady ? [{ type: "play" }] : [],
      };
    }

    case "metadata-ready": {
      if (
        !belongsToCurrentItem(state, event.itemId) ||
        state.status !== "loading"
      ) {
        return unchanged(state);
      }

      const effects: PlaybackEffect[] = [
        { type: "seek", timeSec: state.currentTimeSec },
      ];
      if (state.playIntent) {
        effects.push({ type: "play" });
      }

      return {
        state: {
          ...state,
          status: "ready",
          metadataReady: true,
        },
        effects,
      };
    }

    case "playing": {
      if (
        !belongsToCurrentItem(state, event.itemId) ||
        !state.metadataReady ||
        !state.playIntent ||
        state.advancePending
      ) {
        return unchanged(state);
      }

      return {
        state: { ...state, status: "playing", error: null },
        effects: [],
      };
    }

    case "pause": {
      if (state.item === null) {
        return unchanged(state);
      }

      return {
        state: {
          ...state,
          status: state.metadataReady ? "paused" : state.status,
          playIntent: false,
        },
        effects: shouldPauseElement(state) ? [{ type: "pause" }] : [],
      };
    }

    case "time-update": {
      if (
        !belongsToCurrentItem(state, event.itemId) ||
        !state.metadataReady ||
        !Number.isFinite(event.currentTimeSec)
      ) {
        return unchanged(state);
      }

      const currentTimeSec = clamp(
        event.currentTimeSec,
        state.item.startSec,
        state.item.endSec,
      );
      const reachedEnd =
        event.currentTimeSec >=
        state.item.endSec - RANGE_END_EPSILON_SEC;

      if (
        !reachedEnd ||
        state.status !== "playing" ||
        !state.playIntent ||
        state.advancePending
      ) {
        return {
          state: { ...state, currentTimeSec },
          effects: [],
        };
      }

      return {
        state: {
          ...state,
          status: "paused",
          currentTimeSec: state.item.endSec,
          advancePending: true,
        },
        effects: [
          { type: "pause" },
          { type: "seek", timeSec: state.item.endSec },
          {
            type: "advance",
            itemId: state.item.id,
            reason: "ended",
          },
        ],
      };
    }

    case "seek": {
      if (state.item === null || !Number.isFinite(event.timeSec)) {
        return unchanged(state);
      }

      const timeSec = clamp(
        event.timeSec,
        state.item.startSec,
        state.item.endSec,
      );

      return {
        state: { ...state, currentTimeSec: timeSec },
        effects: state.metadataReady ? [{ type: "seek", timeSec }] : [],
      };
    }

    case "set-volume": {
      const volume = clampVolume(event.volume);

      return {
        state: { ...state, volume },
        effects: [{ type: "set-volume", volume }],
      };
    }

    case "media-error": {
      if (!belongsToCurrentItem(state, event.itemId)) {
        return unchanged(state);
      }

      return {
        state: {
          ...state,
          status: "error",
          metadataReady: false,
          error: event.message || "Не удалось воспроизвести аудио",
        },
        effects: [],
      };
    }

    case "retry": {
      if (state.item === null || state.status !== "error") {
        return unchanged(state);
      }

      return {
        state: {
          ...state,
          status: "loading",
          metadataReady: false,
          currentTimeSec: state.item.startSec,
          advancePending: false,
          error: null,
        },
        effects: [
          {
            type: "load",
            itemId: state.item.id,
            audioUrl: state.item.audioUrl,
          },
        ],
      };
    }

    case "skip": {
      if (state.item === null || state.advancePending) {
        return unchanged(state);
      }

      return {
        state: {
          ...state,
          status: state.metadataReady ? "paused" : state.status,
          advancePending: true,
        },
        effects: [
          ...(shouldPauseElement(state)
            ? ([{ type: "pause" }] satisfies PlaybackEffect[])
            : []),
          {
            type: "advance",
            itemId: state.item.id,
            reason: "skip",
          },
        ],
      };
    }
  }
}

