export type RandomSource = () => number;

export interface QueueState<T extends string> {
  schemaVersion: 1;
  datasetFingerprint: string;
  remaining: T[];
  seenInCycle: T[];
  history: T[];
  cursor: number;
}

export interface QueueDataset<T extends string> {
  fingerprint: string;
  items: readonly T[];
}

function assertDataset<T extends string>(
  items: readonly T[],
  datasetFingerprint: string,
): void {
  if (datasetFingerprint.length === 0) {
    throw new Error("Dataset fingerprint must not be empty");
  }

  if (items.length === 0) {
    throw new Error("Queue must contain at least one item");
  }

  if (new Set(items).size !== items.length) {
    throw new Error("Queue items must be unique");
  }
}

function randomIndex(random: RandomSource, upperBound: number): number {
  const value = random();

  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("Random source must return a number in the [0, 1) range");
  }

  return Math.floor(value * upperBound);
}

/**
 * Returns a shuffled copy and never mutates the input array.
 */
export function fisherYatesShuffle<T>(
  items: readonly T[],
  random: RandomSource = Math.random,
): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(random, index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

function putDifferentItemFirst<T extends string>(
  cycle: T[],
  previousItem: T | undefined,
): T[] {
  if (previousItem === undefined || cycle.length < 2 || cycle[0] !== previousItem) {
    return cycle;
  }

  const differentIndex = cycle.findIndex((item) => item !== previousItem);
  [cycle[0], cycle[differentIndex]] = [
    cycle[differentIndex],
    cycle[0],
  ];
  return cycle;
}

function startCycle<T extends string>(
  items: readonly T[],
  random: RandomSource,
  previousItem?: T,
): { current: T; remaining: T[] } {
  const cycle = putDifferentItemFirst(
    fisherYatesShuffle(items, random),
    previousItem,
  );
  const [current, ...remaining] = cycle;
  return { current, remaining };
}

export function createQueueState<T extends string>(
  dataset: QueueDataset<T>,
  random: RandomSource = Math.random,
): QueueState<T> {
  assertDataset(dataset.items, dataset.fingerprint);
  const { current, remaining } = startCycle(dataset.items, random);

  return {
    schemaVersion: 1,
    datasetFingerprint: dataset.fingerprint,
    remaining,
    seenInCycle: [current],
    history: [current],
    cursor: 0,
  };
}

export function currentQueueItem<T extends string>(
  state: QueueState<T>,
): T {
  return state.history[state.cursor];
}

export function canGoBack<T extends string>(state: QueueState<T>): boolean {
  return state.cursor > 0;
}

export function canGoForward<T extends string>(state: QueueState<T>): boolean {
  return state.cursor < state.history.length - 1;
}

/**
 * Moves through already visited history first. Once at its end, consumes the
 * current shuffled cycle and starts a new one when necessary.
 */
export function advanceQueue<T extends string>(
  state: QueueState<T>,
  dataset: QueueDataset<T>,
  random: RandomSource = Math.random,
): QueueState<T> {
  assertCompatibleState(state, dataset);

  if (canGoForward(state)) {
    return {
      ...state,
      cursor: state.cursor + 1,
    };
  }

  let next: T;
  let remaining: T[];
  let seenInCycle: T[];

  if (state.remaining.length > 0) {
    [next, ...remaining] = state.remaining;
    seenInCycle = [...state.seenInCycle, next];
  } else {
    const nextCycle = startCycle(
      dataset.items,
      random,
      state.history[state.history.length - 1],
    );
    next = nextCycle.current;
    remaining = nextCycle.remaining;
    seenInCycle = [next];
  }

  return {
    ...state,
    remaining,
    seenInCycle,
    history: [...state.history, next],
    cursor: state.history.length,
  };
}

export function rewindQueue<T extends string>(
  state: QueueState<T>,
): QueueState<T> {
  if (!canGoBack(state)) {
    return state;
  }

  return {
    ...state,
    cursor: state.cursor - 1,
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRestorableState<T extends string>(
  value: unknown,
  dataset: QueueDataset<T>,
): value is QueueState<T> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<QueueState<string>>;
  if (
    candidate.schemaVersion !== 1 ||
    candidate.datasetFingerprint !== dataset.fingerprint ||
    !isStringArray(candidate.remaining) ||
    !isStringArray(candidate.seenInCycle) ||
    !isStringArray(candidate.history) ||
    !Number.isInteger(candidate.cursor)
  ) {
    return false;
  }

  const cursor = candidate.cursor as number;
  const allowed = new Set<string>(dataset.items);
  const cycle = [...candidate.seenInCycle, ...candidate.remaining];

  return (
    candidate.history.length > 0 &&
    cursor >= 0 &&
    cursor < candidate.history.length &&
    candidate.history.every((item) => allowed.has(item)) &&
    candidate.seenInCycle.length > 0 &&
    cycle.length === dataset.items.length &&
    new Set(cycle).size === dataset.items.length &&
    cycle.every((item) => allowed.has(item)) &&
    candidate.history[candidate.history.length - 1] ===
      candidate.seenInCycle[candidate.seenInCycle.length - 1]
  );
}

/**
 * Restores a JSON-compatible snapshot. A changed dataset fingerprint or a
 * malformed snapshot starts a fresh shuffled queue.
 */
export function restoreQueueState<T extends string>(
  dataset: QueueDataset<T>,
  persisted: unknown,
  random: RandomSource = Math.random,
): QueueState<T> {
  assertDataset(dataset.items, dataset.fingerprint);

  if (!isRestorableState(persisted, dataset)) {
    return createQueueState(dataset, random);
  }

  return {
    schemaVersion: 1,
    datasetFingerprint: persisted.datasetFingerprint,
    remaining: [...persisted.remaining],
    seenInCycle: [...persisted.seenInCycle],
    history: [...persisted.history],
    cursor: persisted.cursor,
  };
}

function assertCompatibleState<T extends string>(
  state: QueueState<T>,
  dataset: QueueDataset<T>,
): void {
  assertDataset(dataset.items, dataset.fingerprint);

  if (!isRestorableState(state, dataset)) {
    throw new Error("Queue state does not match the current dataset");
  }
}

/**
 * Small deterministic PRNG suitable for repeatable shuffles and tests.
 */
export function createSeededRandom(seed: string | number): RandomSource {
  const input = String(seed);
  let hash = 2_166_136_261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return () => {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
