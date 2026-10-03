import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, runTest) => {
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return ['localhost', '127.0.0.1'].includes(url.hostname)
        ? route.continue()
        : route.abort('blockedbyclient');
    });
    await runTest(page);
  },
});
export { expect };
