"use client";

import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  ExternalLink,
  FileText,
  Info,
  LoaderCircle,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Volume2,
  WifiOff,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createPlaybackState,
  reducePlayback,
  type PlaybackEffect,
  type PlaybackEvent,
  type PlaybackState,
} from "../domain/playback";
import {
  advanceQueue,
  canGoBack,
  currentQueueItem,
  restoreQueueState,
  rewindQueue,
  type QueueDataset,
  type QueueState,
} from "../domain/queue";

import type {
  Catalog,
  CatalogItem,
  EpisodeData,
  ListeningMode,
  TranscriptPhrase,
} from "./types";

const STORAGE_PREFIX = "zavtracast-sdvg:v1";
const RUSSIAN_DATE_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const EMPTY_QUEUE = { topics: null, minute: null } satisfies Record<
  ListeningMode,
  QueueState<string> | null
>;

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;

  return [
    ...(hours > 0 ? [String(hours)] : []),
    String(minutes).padStart(hours > 0 ? 2 : 1, "0"),
    String(remainder).padStart(2, "0"),
  ].join(":");
}

function readStoredJson(key: string): unknown {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as unknown) : null;
  } catch {
    return null;
  }
}

function datasetFor(
  catalog: Catalog,
  mode: ListeningMode,
): QueueDataset<string> | null {
  const items = catalog.items[mode === "topics" ? "topics" : "minute"];
  if (items.length === 0) {
    return null;
  }
  return {
    fingerprint: `${catalog.fingerprint}:${mode}`,
    items: items.map((item) => item.id),
  };
}

function findActivePhrase(
  phrases: TranscriptPhrase[],
  currentTimeSec: number,
): TranscriptPhrase | null {
  let closest: TranscriptPhrase | null = null;
  for (const phrase of phrases) {
    if (phrase.startSec <= currentTimeSec) {
      closest = phrase;
    }
    if (
      currentTimeSec >= phrase.startSec &&
      currentTimeSec <= phrase.endSec
    ) {
      return phrase;
    }
    if (phrase.startSec > currentTimeSec) {
      break;
    }
  }
  return closest;
}

function TranscriptDialog({
  episode,
  currentItem,
  currentTimeSec,
  onClose,
  onSeek,
}: {
  episode: EpisodeData;
  currentItem: CatalogItem;
  currentTimeSec: number;
  onClose: () => void;
  onSeek: (timeSec: number) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activePhrase = findActivePhrase(
    episode.transcript.phrases,
    currentTimeSec,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    }
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="transcript-dialog"
      aria-labelledby="transcript-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <header className="dialog-header">
        <div>
          <p className="section-kicker">Расшифровка эфира</p>
          <h2 id="transcript-title">{episode.metadata.title}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose}>
          <X aria-hidden="true" />
          <span className="sr-only">Закрыть расшифровку</span>
        </button>
      </header>
      <p className="dialog-hint">
        Нажмите на таймкод, чтобы продолжить с этой фразы. Текущий отрывок
        отмечен жёлтой линией.
      </p>
      <ol className="transcript-list">
        {episode.transcript.phrases.map((phrase) => {
          const inCurrentRange =
            phrase.endSec >= currentItem.startSec &&
            phrase.startSec <= currentItem.endSec;
          return (
            <li
              key={phrase.id}
              className={[
                inCurrentRange ? "is-in-range" : "",
                activePhrase?.id === phrase.id ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                onClick={() => {
                  onSeek(phrase.startSec);
                  onClose();
                }}
                aria-label={`Перейти к ${formatTime(phrase.startSec)}`}
              >
                {formatTime(phrase.startSec)}
              </button>
              <p>{phrase.text}</p>
            </li>
          );
        })}
      </ol>
    </dialog>
  );
}

export function App() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sourceDialogRef = useRef<HTMLDialogElement>(null);
  const episodeCacheRef = useRef(new Map<string, EpisodeData>());
  const runEffectsRef = useRef<(effects: PlaybackEffect[]) => void>(() => {});
  const advanceRef = useRef<() => void>(() => {});

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogRequest, setCatalogRequest] = useState(0);
  const [mode, setMode] = useState<ListeningMode>("topics");
  const [queues, setQueues] =
    useState<Record<ListeningMode, QueueState<string> | null>>(EMPTY_QUEUE);
  const [episode, setEpisode] = useState<EpisodeData | null>(null);
  const [episodeError, setEpisodeError] = useState<string | null>(null);
  const [episodeRequest, setEpisodeRequest] = useState(0);
  const [playback, setPlayback] = useState<PlaybackState>(() =>
    createPlaybackState(0.82),
  );
  const playbackRef = useRef(playback);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const dialog = sourceDialogRef.current;
    if (!dialog) return;
    if (sourceOpen && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    } else if (!sourceOpen && dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [sourceOpen]);

  const dispatchPlayback = useCallback((event: PlaybackEvent) => {
    const transition = reducePlayback(playbackRef.current, event);
    playbackRef.current = transition.state;
    setPlayback(transition.state);
    runEffectsRef.current(transition.effects);
  }, []);

  useEffect(() => {
    let active = true;
    const storedMode = window.localStorage.getItem(`${STORAGE_PREFIX}:mode`);
    const storedVolumeValue = window.localStorage.getItem(
      `${STORAGE_PREFIX}:volume`,
    );
    const storedVolume =
      storedVolumeValue === null ? Number.NaN : Number(storedVolumeValue);
    queueMicrotask(() => {
      if (!active) {
        return;
      }
      setOnline(window.navigator.onLine);
      if (storedMode === "topics" || storedMode === "minute") {
        setMode(storedMode);
      }
      if (
        Number.isFinite(storedVolume) &&
        storedVolume >= 0 &&
        storedVolume <= 1
      ) {
        dispatchPlayback({ type: "set-volume", volume: storedVolume });
      }
    });

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [dispatchPlayback]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/catalog.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Каталог ответил кодом ${response.status}`);
        }
        return (await response.json()) as Catalog;
      })
      .then((nextCatalog) => {
        const nextQueues: Record<
          ListeningMode,
          QueueState<string> | null
        > = {
          topics: null,
          minute: null,
        };
        for (const nextMode of ["topics", "minute"] as const) {
          const dataset = datasetFor(nextCatalog, nextMode);
          if (dataset) {
            nextQueues[nextMode] = restoreQueueState(
              dataset,
              readStoredJson(`${STORAGE_PREFIX}:queue:${nextMode}`),
            );
          }
        }
        setQueues(nextQueues);
        setCatalog(nextCatalog);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setCatalogError(
            error instanceof Error ? error.message : "Не удалось открыть каталог",
          );
        }
      });
    return () => controller.abort();
  }, [catalogRequest]);

  useEffect(() => {
    if (!catalog) {
      return;
    }
    for (const nextMode of ["topics", "minute"] as const) {
      const state = queues[nextMode];
      if (state) {
        window.localStorage.setItem(
          `${STORAGE_PREFIX}:queue:${nextMode}`,
          JSON.stringify(state),
        );
      }
    }
  }, [catalog, queues]);

  useEffect(() => {
    window.localStorage.setItem(`${STORAGE_PREFIX}:mode`, mode);
  }, [mode]);

  useEffect(() => {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}:volume`,
      String(playback.volume),
    );
  }, [playback.volume]);

  const activeQueue = queues[mode];
  const currentItemId = activeQueue ? currentQueueItem(activeQueue) : null;
  const currentItem = useMemo(
    () =>
      catalog && currentItemId
        ? catalog.items[mode === "topics" ? "topics" : "minute"].find(
            (item) => item.id === currentItemId,
          ) ?? null
        : null,
    [catalog, currentItemId, mode],
  );
  const catalogEpisode = useMemo(
    () =>
      catalog?.episodes.find((item) => item.id === currentItem?.episodeId) ??
      null,
    [catalog, currentItem],
  );

  const moveQueue = useCallback(
    (direction: "back" | "next") => {
      if (!catalog) {
        return;
      }
      setQueues((previous) => {
        const state = previous[mode];
        const dataset = datasetFor(catalog, mode);
        if (!state || !dataset || (direction === "back" && !canGoBack(state))) {
          return previous;
        }
        return {
          ...previous,
          [mode]:
            direction === "back"
              ? rewindQueue(state)
              : advanceQueue(state, dataset),
        };
      });
    },
    [catalog, mode],
  );

  useEffect(() => {
    advanceRef.current = () => moveQueue("next");
  }, [moveQueue]);

  useEffect(() => {
    runEffectsRef.current = (effects) => {
      const audio = audioRef.current;
      for (const effect of effects) {
        if (effect.type === "advance") {
          advanceRef.current();
          continue;
        }
        if (!audio) {
          continue;
        }
        switch (effect.type) {
          case "load":
            audio.src = effect.audioUrl;
            audio.load();
            break;
          case "seek":
            audio.currentTime = effect.timeSec;
            break;
          case "play":
            void audio.play().catch(() => {
              const itemId = playbackRef.current.item?.id;
              if (itemId) {
                dispatchPlayback({
                  type: "media-error",
                  itemId,
                  message: "Браузер не смог запустить поток",
                });
              }
            });
            break;
          case "pause":
            audio.pause();
            break;
          case "set-volume":
            audio.volume = effect.volume;
            break;
        }
      }
    };
  }, [dispatchPlayback]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = playback.volume;
    }
  }, [catalog, playback.volume]);

  useEffect(() => {
    let active = true;
    if (!currentItem || !catalogEpisode) {
      return () => {
        active = false;
      };
    }
    const cached = episodeCacheRef.current.get(currentItem.episodeId);
    if (cached) {
      queueMicrotask(() => {
        if (!active) {
          return;
        }
        setEpisode(cached);
        dispatchPlayback({
          type: "load-item",
          item: {
            id: currentItem.id,
            audioUrl: cached.metadata.audioUrl,
            startSec: currentItem.startSec,
            endSec: currentItem.endSec,
          },
        });
      });
      return () => {
        active = false;
      };
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      if (active) {
        setEpisode(null);
        setEpisodeError(null);
      }
    });
    fetch(catalogEpisode.dataPath, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Выпуск ответил кодом ${response.status}`);
        }
        return (await response.json()) as EpisodeData;
      })
      .then((nextEpisode) => {
        if (!active) {
          return;
        }
        episodeCacheRef.current.set(currentItem.episodeId, nextEpisode);
        setEpisode(nextEpisode);
        dispatchPlayback({
          type: "load-item",
          item: {
            id: currentItem.id,
            audioUrl: nextEpisode.metadata.audioUrl,
            startSec: currentItem.startSec,
            endSec: currentItem.endSec,
          },
        });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setEpisodeError(
            error instanceof Error ? error.message : "Не удалось открыть выпуск",
          );
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    catalogEpisode,
    currentItem,
    dispatchPlayback,
    episodeRequest,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLButtonElement ||
        target instanceof HTMLAnchorElement ||
        target instanceof HTMLDialogElement
      ) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        dispatchPlayback({ type: playback.playIntent ? "pause" : "play" });
      } else if (event.code === "ArrowLeft") {
        dispatchPlayback({
          type: "seek",
          timeSec: playback.currentTimeSec - 10,
        });
      } else if (event.code === "ArrowRight") {
        dispatchPlayback({
          type: "seek",
          timeSec: playback.currentTimeSec + 10,
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatchPlayback, playback.currentTimeSec, playback.playIntent]);

  const activePhrase = useMemo(
    () =>
      episode
        ? findActivePhrase(episode.transcript.phrases, playback.currentTimeSec)
        : null,
    [episode, playback.currentTimeSec],
  );

  const duration = currentItem
    ? currentItem.endSec - currentItem.startSec
    : 0;
  const elapsed = currentItem
    ? Math.max(0, playback.currentTimeSec - currentItem.startSec)
    : 0;
  const progress = duration > 0 ? Math.min(duration, elapsed) : 0;

  function changeMode(nextMode: ListeningMode) {
    if (nextMode === mode) {
      return;
    }
    dispatchPlayback({ type: "pause" });
    setMode(nextMode);
    setSourceOpen(false);
    setTranscriptOpen(false);
  }

  function handleProgress(event: ChangeEvent<HTMLInputElement>) {
    if (currentItem) {
      dispatchPlayback({
        type: "seek",
        timeSec: currentItem.startSec + Number(event.target.value),
      });
    }
  }

  if (!catalog && !catalogError) {
    return (
      <main className="state-page" aria-busy="true">
        <Radio className="state-mark" aria-hidden="true" />
        <p className="section-kicker">Ловим волну</p>
        <h1>Синдром Дефицита</h1>
        <p>Вау Голубь</p>
        <p>Перебираем годы, темы и голубей…</p>
        <LoaderCircle className="spinner" aria-hidden="true" />
      </main>
    );
  }

  if (catalogError || !catalog) {
    return (
      <main className="state-page">
        <WifiOff className="state-mark" aria-hidden="true" />
        <p className="section-kicker">В эфире помехи</p>
        <h1>Каталог не настроился</h1>
        <p>{catalogError}</p>
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            setCatalogError(null);
            setCatalogRequest((value) => value + 1);
          }}
        >
          <RefreshCw aria-hidden="true" />
          Повторить
        </button>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={() => {
          const itemId = playbackRef.current.item?.id;
          if (itemId) {
            dispatchPlayback({ type: "metadata-ready", itemId });
          }
        }}
        onPlaying={() => {
          const itemId = playbackRef.current.item?.id;
          if (itemId) {
            dispatchPlayback({ type: "playing", itemId });
          }
        }}
        onTimeUpdate={(event) => {
          const itemId = playbackRef.current.item?.id;
          if (itemId) {
            dispatchPlayback({
              type: "time-update",
              itemId,
              currentTimeSec: event.currentTarget.currentTime,
            });
          }
        }}
        onError={() => {
          const itemId = playbackRef.current.item?.id;
          if (itemId) {
            dispatchPlayback({
              type: "media-error",
              itemId,
              message: online
                ? "Не удалось загрузить аудио из сети"
                : "Для аудио нужно подключение к сети",
            });
          }
        }}
      >
        {episode && (
          <track
            kind="captions"
            src={`/data/episodes/${episode.metadata.id}.vtt`}
            srcLang="ru"
            label="Русский"
            default
          />
        )}
      </audio>

      {!online && (
        <div className="offline-banner" role="status">
          <WifiOff aria-hidden="true" />
          Обложки и текст доступны офлайн. Для звука вернитесь в сеть.
        </div>
      )}

      <header className="site-header">
        <a className="brand" href="#" aria-label="Завтракаст СДВГ — начало">
          <span className="brand-mark">
            <Radio aria-hidden="true" />
          </span>
          <span>
            <h1>Синдром Дефицита</h1>
            <small>Вау Голубь</small>
          </span>
        </a>
        <p className="on-air">
          <span aria-hidden="true" />
          Случайный эфир · 2015—2026
        </p>
      </header>

      <section className="radio-stage" aria-labelledby="current-title">
        <div className="hero-art" aria-hidden="true">
          {/* Vinext's Next image optimizer is unavailable in the static worker. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/art/pigeon-radio.png"
            alt=""
          />
          <span className="hero-frequency">87.5—108 FM</span>
        </div>

        <div className="console">
          <div className="mode-switcher" aria-label="Режим проигрывания">
            <button
              type="button"
              className={mode === "topics" ? "is-active" : ""}
              aria-pressed={mode === "topics"}
              onClick={() => changeMode("topics")}
            >
              По темам
            </button>
            <button
              type="button"
              className={mode === "minute" ? "is-active" : ""}
              aria-pressed={mode === "minute"}
              onClick={() => changeMode("minute")}
            >
              Одна минута
            </button>
          </div>

          {currentItem && catalogEpisode ? (
            <>
              <div className="track-heading">
                <p className="section-kicker">
                  {mode === "topics" ? "Тема из архива" : "Законченная мысль"}
                  <span aria-hidden="true"> / </span>
                  {formatTime(duration)}
                </p>
                <h2 id="current-title">{currentItem.title}</h2>
                <p className="track-description">{currentItem.description}</p>
              </div>

              <div className="transport" aria-label="Управление эфиром">
                <button
                  className="transport-button"
                  type="button"
                  onClick={() => moveQueue("back")}
                  disabled={!activeQueue || !canGoBack(activeQueue)}
                >
                  <ArrowLeft aria-hidden="true" />
                  <span>Назад</span>
                </button>
                <button
                  className="play-button"
                  type="button"
                  disabled={!episode || playback.status === "loading"}
                  onClick={() =>
                    dispatchPlayback({
                      type: playback.playIntent ? "pause" : "play",
                    })
                  }
                  aria-label={playback.playIntent ? "Пауза" : "Слушать"}
                >
                  {playback.status === "loading" ? (
                    <LoaderCircle className="spinner" aria-hidden="true" />
                  ) : playback.playIntent ? (
                    <Pause aria-hidden="true" fill="currentColor" />
                  ) : (
                    <Play aria-hidden="true" fill="currentColor" />
                  )}
                </button>
                <button
                  className="transport-button"
                  type="button"
                  onClick={() => {
                    dispatchPlayback({ type: "skip" });
                  }}
                >
                  <ArrowRight aria-hidden="true" />
                  <span>Дальше</span>
                </button>
              </div>

              <div className="timeline">
                <span aria-hidden="true">{formatTime(progress)}</span>
                <label className="sr-only" htmlFor="track-progress">
                  Позиция в отрывке
                </label>
                <input
                  id="track-progress"
                  type="range"
                  min={0}
                  max={Math.max(1, duration)}
                  step={0.1}
                  value={progress}
                  onChange={handleProgress}
                  style={{
                    "--range-progress": `${duration > 0 ? (progress / duration) * 100 : 0}%`,
                  } as CSSProperties}
                />
                <span aria-hidden="true">−{formatTime(duration - progress)}</span>
              </div>

              <div className="volume-row">
                <Volume2 aria-hidden="true" />
                <label className="sr-only" htmlFor="volume">
                  Громкость
                </label>
                <input
                  id="volume"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={playback.volume}
                  onChange={(event) =>
                    dispatchPlayback({
                      type: "set-volume",
                      volume: Number(event.target.value),
                    })
                  }
                  style={{
                    "--range-progress": `${playback.volume * 100}%`,
                  } as CSSProperties}
                />
                <span>{Math.round(playback.volume * 100)}%</span>
              </div>

              {episodeError && (
                <div className="inline-error" role="alert">
                  <p>{episodeError}</p>
                  <button
                    type="button"
                    onClick={() => setEpisodeRequest((value) => value + 1)}
                  >
                    Загрузить ещё раз
                  </button>
                </div>
              )}
              {playback.status === "error" && (
                <div className="inline-error" role="alert">
                  <p>{playback.error}</p>
                  <button
                    type="button"
                    onClick={() => dispatchPlayback({ type: "retry" })}
                  >
                    Повторить
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatchPlayback({ type: "skip" })}
                  >
                    Другой отрывок
                  </button>
                </div>
              )}

              <div className="now-speaking" aria-live="polite">
                <span className="quote-mark" aria-hidden="true">
                  «
                </span>
                <div>
                  <p className="section-kicker">Сейчас говорят</p>
                  <p>
                    {activePhrase?.text ??
                      (episode
                        ? "Точная фраза появится вместе со звуком."
                        : "Загружаем расшифровку…")}
                  </p>
                </div>
              </div>

              <div className="episode-actions">
                <button type="button" onClick={() => setSourceOpen(true)}>
                  <Info aria-hidden="true" />
                  Откуда этот фрагмент?
                </button>
                <button
                  type="button"
                  onClick={() => setTranscriptOpen(true)}
                  disabled={!episode}
                >
                  <FileText aria-hidden="true" />
                  Вся расшифровка
                </button>
              </div>
            </>
          ) : (
            <div className="empty-mode" role="status">
              <Radio aria-hidden="true" />
              <h2 id="current-title">На этой частоте пока тихо</h2>
              <p>
                Для выбранного режима ещё нет подготовленных фрагментов.
                Попробуйте другой.
              </p>
            </div>
          )}
        </div>
      </section>

      <footer className="site-footer">
        <p>
          Неформальный архивный приёмник. Аудио принадлежит авторам
          Завтракаста.
        </p>
        <p>Пробел — пауза · ← → — перемотка 10 секунд</p>
      </footer>

      {sourceOpen && currentItem && catalogEpisode && (
        <dialog
          ref={sourceDialogRef}
          className="source-drawer"
          aria-labelledby="source-title"
          onCancel={() => setSourceOpen(false)}
          onClose={() => setSourceOpen(false)}
        >
            <header className="drawer-header">
              <p className="section-kicker">Поймано в архиве</p>
              <button
                className="icon-button"
                type="button"
                onClick={() => setSourceOpen(false)}
              >
                <X aria-hidden="true" />
                <span className="sr-only">Закрыть информацию</span>
              </button>
            </header>
            <div className="cover">
              {/* Local PWA cover: direct URL also works from the offline cache. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={catalogEpisode.localCoverPath}
                alt={`Обложка выпуска №${catalogEpisode.number}`}
              />
            </div>
            <p className="episode-number">
              Выпуск №{catalogEpisode.number} · {catalogEpisode.year}
            </p>
            <h2 id="source-title">{catalogEpisode.title}</h2>
            <p className="drawer-date">
              <Clock3 aria-hidden="true" />
              {RUSSIAN_DATE_FORMATTER.format(
                new Date(catalogEpisode.publishedAt),
              )}
            </p>
            <p>{episode?.metadata.summary ?? currentItem.description}</p>
            {episode && (
              <a
                className="primary-button"
                href={episode.metadata.pageUrl}
                target="_blank"
                rel="noreferrer"
              >
                Открыть выпуск
                <ExternalLink aria-hidden="true" />
              </a>
            )}
        </dialog>
      )}

      {transcriptOpen && episode && currentItem && (
        <TranscriptDialog
          episode={episode}
          currentItem={currentItem}
          currentTimeSec={playback.currentTimeSec}
          onClose={() => setTranscriptOpen(false)}
          onSeek={(timeSec) =>
            dispatchPlayback({ type: "seek", timeSec })
          }
        />
      )}

    </main>
  );
}
