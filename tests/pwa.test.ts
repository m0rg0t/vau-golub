import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("PWA assets", () => {
  it("provides a Russian standalone manifest with installable icons", async () => {
    const manifest = JSON.parse(
      await readFile("public/manifest.webmanifest", "utf8"),
    );
    expect(manifest).toMatchObject({
      lang: "ru",
      display: "standalone",
      start_url: "/",
      theme_color: "#111313",
    });
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
      ]),
    );

    for (const icon of manifest.icons) {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=s=x:p=0",
        `public${icon.src}`,
      ]);
      expect(stdout.trim()).toBe(icon.sizes);
    }
  });

  it("keeps audio requests network-only", async () => {
    const serviceWorker = await readFile("public/sw.js", "utf8");
    expect(serviceWorker).toContain('request.destination === "audio"');
    expect(serviceWorker).toContain('endsWith(".mp3")');
    expect(serviceWorker).toMatch(
      /if \(isAudio \|\| url\.origin !== self\.location\.origin\) \{\s*event\.respondWith\(fetch\(request\)\)/,
    );
    expect(serviceWorker).not.toMatch(/cache\.put\([^)]*mp3/i);
    expect(serviceWorker).toContain('event.data?.type !== "CACHE_URLS"');
  });
});
