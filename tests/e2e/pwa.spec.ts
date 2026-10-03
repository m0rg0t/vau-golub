import { expect, test } from "./fixtures";

test("keeps shell and transcript data available offline without caching MP3", async ({
  context,
  page,
}) => {
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
  await expect(page.getByText("Обложки и текст доступны офлайн.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Вся расшифровка" })).toBeEnabled();
  await page.getByRole("button", { name: "Вся расшифровка" }).click();
  await expect(page.getByText("Расшифровка эфира")).toBeVisible();
});
