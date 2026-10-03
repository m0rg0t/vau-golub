import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const origin = 'https://fixture.invalid';
const source = await readFile('public/sw.js', 'utf8');
const matchPublicCache = runInNewContext(`${source}\nmatchPublicCache`, {
  self: { location: { origin }, addEventListener: () => {} }, URL,
}) as (cache: { match: ReturnType<typeof vi.fn> }, request: Request) => Promise<Response | undefined>;

function fixture(vary = 'Origin', allowedOrigin = origin) {
  const response = new Response('synthetic public asset', { headers: { Vary: vary, 'Access-Control-Allow-Origin': allowedOrigin } });
  const cache = { match: vi.fn(async (_request, options) => options?.ignoreVary ? response : undefined) };
  return { cache, response };
}

describe('public asset cache variants', () => {
  it.each(['/_next/static/chunks/app.js', '/data/catalog.json'])(
    'reuses warmed %s for a same-origin module/preload request', async path => {
      const { cache, response } = fixture();
      expect(await matchPublicCache(cache, new Request(origin + path, { headers: { Origin: origin } }))).toBe(response);
    },
  );
  it('retains a normal exact cache hit', async () => {
    const response = new Response('exact');
    const cache = { match: vi.fn(async () => response) };
    expect(await matchPublicCache(cache, new Request(origin + '/data/catalog.json'))).toBe(response);
    expect(cache.match).toHaveBeenCalledTimes(1);
  });
  it.each(['Origin, Cookie', 'Authorization', '*', 'RSC'])('preserves Vary: %s', async vary => {
    expect(await matchPublicCache(fixture(vary).cache, new Request(origin + '/data/catalog.json'))).toBeUndefined();
  });
  it.each(['/api/private', '/data/audio.mp3'])('does not broaden caching for %s', async path => {
    const { cache } = fixture();
    expect(await matchPublicCache(cache, new Request(origin + path))).toBeUndefined();
    expect(cache.match).toHaveBeenCalledTimes(1);
  });
  it('rejects foreign requests and foreign cached allow-origin responses', async () => {
    expect(await matchPublicCache(fixture().cache, new Request('https://other.invalid/data/catalog.json'))).toBeUndefined();
    expect(await matchPublicCache(fixture().cache, new Request(origin + '/data/catalog.json', { headers: { Origin: 'https://other.invalid' } }))).toBeUndefined();
    expect(await matchPublicCache(fixture('Origin', 'https://other.invalid').cache, new Request(origin + '/data/catalog.json'))).toBeUndefined();
  });
  it('does not apply the fallback to POST', async () => {
    const { cache } = fixture();
    expect(await matchPublicCache(cache, new Request(origin + '/data/catalog.json', { method: 'POST' }))).toBeUndefined();
    expect(cache.match).toHaveBeenCalledTimes(1);
  });
  it.each(['private', 'public, no-store', 'PRIVATE="Set-Cookie"'])(
    'rejects Cache-Control: %s for exact and Origin-only matches', async cacheControl => {
      const response = new Response('private fixture', { headers: { Vary: 'Origin', 'Cache-Control': cacheControl } });
      for (const exact of [false, true]) {
        const cache = { match: vi.fn(async (_request, options) => exact || options?.ignoreVary ? response : undefined) };
        expect(await matchPublicCache(cache, new Request(origin + '/data/catalog.json'))).toBeUndefined();
      }
    },
  );
});

describe('shell cache privacy', () => {
  it.each(['private', 'no-store'])('does not precache a %s shell', async cacheControl => {
    const handlers: Record<string, (event: { waitUntil: (promise: Promise<unknown>) => void }) => void> = {};
    const cache = { put: vi.fn<(url: string, response: Response) => Promise<void>>().mockResolvedValue(undefined) };
    runInNewContext(source, {
      self: { addEventListener: (name: string, callback: typeof handlers[string]) => { handlers[name] = callback; }, skipWaiting: async () => {} },
      caches: { open: async () => cache },
      fetch: async (url: string) => new Response('fixture', { headers: { 'Cache-Control': url === '/' ? cacheControl : 'public, max-age=60' } }),
    });
    let done!: Promise<unknown>;
    handlers.install({ waitUntil: promise => { done = promise; } });
    await done;
    expect(cache.put.mock.calls.some(call => call[0] === '/')).toBe(false);
    expect(cache.put).toHaveBeenCalledTimes(5);
  });
  it.each(['private', 'no-store'])('rejects a cached %s navigation shell', async cacheControl => {
    const open = vi.fn(async () => ({ match: async () => new Response('private fixture', { headers: { 'Cache-Control': cacheControl } }) }));
    const navigate = runInNewContext(`${source}\nhandleNavigate`, {
      self: { addEventListener: () => {} }, caches: { open },
      fetch: async () => { throw new Error('synthetic offline'); }, Response,
    });
    const response = await navigate({ preloadResponse: undefined }, new Request(origin));
    expect(response.type).toBe('error');
    expect(open).toHaveBeenCalledWith('zavtracast-sdvg-v5');
  });
  it('uses only the current public shell when offline', async () => {
    const response = new Response('current public shell', { headers: { 'Cache-Control': 'public, max-age=60' } });
    const open = vi.fn(async () => ({ match: async () => response }));
    const globalMatch = vi.fn(async () => new Response('unrelated cache'));
    const navigate = runInNewContext(`${source}\nhandleNavigate`, {
      self: { addEventListener: () => {} }, caches: { open, match: globalMatch },
      fetch: async () => { throw new Error('synthetic offline'); }, Response,
    });
    expect(await navigate({ preloadResponse: undefined }, new Request(origin))).toBe(response);
    expect(globalMatch).not.toHaveBeenCalled();
  });
});
