import { expect, test } from "./fixtures";

test("keeps shell and transcript data available offline without caching MP3", async ({
  context,
  page,
}) => {
  const evidence: string[] = [];
  page.on('console', message => evidence.push(`console ${message.type()}: ${message.text()}`));
  page.on('pageerror', error => evidence.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => evidence.push(`failed: ${request.url()} ${request.failure()?.errorText}`));
  const remoteRequests: string[] = [];
  context.on('request', request => {
    if (!['localhost', '127.0.0.1'].includes(new URL(request.url()).hostname)) remoteRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Слушать" })).toBeEnabled({
    timeout: 15_000,
  });

  const collectCachedUrls = () =>
    page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      const names = await caches.keys();
      const urls: string[] = [];
      for (const name of names) {
        const cache = await caches.open(name);
        urls.push(...(await cache.keys()).map((request) => request.url));
      }
      return urls;
    });

  // The dataset is cached in the background during browser idle time.
  await expect
    .poll(collectCachedUrls, { timeout: 30_000 })
    .toEqual(
      expect.arrayContaining([
        expect.stringContaining("/data/catalog.json"),
        expect.stringContaining("/data/items-topics.json"),
        expect.stringContaining("/data/episodes/zc-02.json"),
      ]),
    );
  const cachedUrls = await collectCachedUrls();
  expect(cachedUrls.some((url) => url.toLowerCase().endsWith(".mp3"))).toBe(
    false,
  );

  // A dataset cache is not proof that the current hydration chunks are ready.
  await expect.poll(async () => page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map(entry => entry.name)
      .filter(url => new URL(url).pathname.startsWith('/_next/'));
    return urls.length > 0 && (await Promise.all(urls.map(url => caches.match(url)))).every(Boolean);
  }), { timeout: 30_000 }).toBe(true);

  await context.setOffline(true);
  await page.reload();
  try {
    await expect(page.getByText("Обложки и текст доступны офлайн.")).toBeVisible();
  } catch (error) {
    const cacheEvidence = await page.evaluate(async () => {
      const results = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          if (!request.url.includes('/_next/') && !request.url.endsWith('/catalog.json')) continue;
          const response = await cache.match(request);
          results.push({ url: request.url, requestHeaders: [...request.headers], responseHeaders: response ? [...response.headers] : [], type: response?.type, status: response?.status });
        }
      }
      return { controlled: Boolean(navigator.serviceWorker.controller), results };
    });
    console.log('OFFLINE_DIAGNOSTICS', JSON.stringify({ evidence, remoteRequests, body: await page.locator('body').innerText(), cacheEvidence }));
    throw error;
  }
  await expect(page.getByRole("button", { name: "Вся расшифровка" })).toBeEnabled();
  await page.getByRole("button", { name: "Вся расшифровка" }).click();
  await expect(page.getByText("Расшифровка эфира")).toBeVisible();
  expect(remoteRequests).toEqual([]);
});
