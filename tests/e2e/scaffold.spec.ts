import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("shows the Russian product shell without critical accessibility issues", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Завтракаст СДВГ" }),
  ).toBeVisible();
  await expect(page.getByText("Синдром Дефицита Где Голубь")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});
