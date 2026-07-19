import { expect, test } from "@playwright/test";

test("switches modes and preserves minute history", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#current-title")).toBeVisible();

  await page.getByRole("button", { name: "Одна минута" }).click();
  await expect(page.locator("#current-title")).toContainText(/^Минута \d+$/);
  const firstMinute = await page.locator("#current-title").textContent();

  await page.getByRole("button", { name: "Дальше" }).click();
  await expect(page.getByRole("button", { name: "Назад" })).toBeEnabled();
  await expect(page.locator("#current-title")).not.toHaveText(firstMinute ?? "");

  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page.locator("#current-title")).toHaveText(firstMinute ?? "");
});

test("opens source information and the full transcript", async ({ page }) => {
  await page.goto("/");
  // Catalog → items → episode data load in sequence on a cold cache.
  await expect(page.getByRole("button", { name: "Слушать" })).toBeEnabled({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Откуда этот фрагмент?" }).click();
  const source = page.getByRole("dialog");
  await expect(source).toBeVisible();
  await expect(source.getByText(/^Выпуск №\d+ · 20\d{2}$/)).toBeVisible();
  await expect(source.getByRole("link", { name: "Открыть выпуск" })).toHaveAttribute(
    "href",
    /^https:\/\/zavtracast\.ru\/\d+\.html$/,
  );
  await source
    .getByRole("button", { name: "Закрыть информацию", exact: true })
    .click();

  await page.getByRole("button", { name: "Вся расшифровка" }).click();
  const transcript = page
    .getByRole("dialog")
    .filter({ hasText: "Расшифровка эфира" });
  await expect(transcript.getByText("Расшифровка эфира")).toBeVisible();
  await expect(
    transcript.getByRole("button", { name: /^Перейти к \d+:\d{2}$/ }).first(),
  ).toBeVisible();
});
