import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, runTest) => {
    await page.addInitScript(() => {
      // Routing does not intercept fetches performed by a service worker.
      // Replace remote media before the browser can initiate any request.
      const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')!;
      const silence = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA==';
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        ...descriptor,
        set(value: string) {
          const url = new URL(value, location.href);
          descriptor.set!.call(this, url.origin === location.origin ? value : silence);
        },
      });
    });
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
