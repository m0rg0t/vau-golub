import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("shows the Russian product shell without critical accessibility issues", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Синдром Дефицита" }),
  ).toBeVisible();
  await expect(page.getByText("Вау Голубь")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Завтракаста", exact: true }),
  ).toHaveAttribute("href", "https://zavtracast.ru");

  await page.getByText("Обработанные выпуски", { exact: true }).click();
  await expect(page.getByText(/\d+ выпусков/)).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});
