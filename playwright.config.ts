import { defineConfig, devices } from "@playwright/test";

const production = process.env.PLAYWRIGHT_PRODUCTION === "1";
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL =
  externalBaseUrl ??
  (production ? "http://localhost:3100" : "http://localhost:3000");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 2,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: production ? "npm start -- --port 3100" : "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
      },
});
