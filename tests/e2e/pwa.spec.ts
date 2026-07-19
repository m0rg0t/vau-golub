import { expect, test } from "@playwright/test";

test("keeps shell and transcript data available offline without caching MP3", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Слушать" })).toBeEnabled({
    timeout: 15_000,
  });

  const cachedUrls = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    await new Promise((resolve) => setTimeout(resolve, 500));
    const names = await caches.keys();
    const urls: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      urls.push(...(await cache.keys()).map((request) => request.url));
    }
    return urls;
  });
  expect(cachedUrls.some((url) => url.endsWith("/data/catalog.json"))).toBe(
    true,
  );
  expect(cachedUrls.some((url) => url.endsWith("/data/episodes/zc-02.json"))).toBe(
    true,
  );
  expect(cachedUrls.some((url) => url.toLowerCase().endsWith(".mp3"))).toBe(
    false,
  );

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Обложки и текст доступны офлайн.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Вся расшифровка" })).toBeEnabled();
  await page.getByRole("button", { name: "Вся расшифровка" }).click();
  await expect(page.getByText("Расшифровка эфира")).toBeVisible();
});
