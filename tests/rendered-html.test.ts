import { describe, expect, it } from "vitest";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

describe("static application shell", () => {
  it("renders the Russian product identity without starter metadata", async () => {
    const response = await render();
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html\b/i);
    expect(html).toContain(
      "<title>Синдром Дефицита Вау Голубь — случайные темы из архива подкаста Завтракаст</title>",
    );
    // Body copy unique to the App shell — not satisfied by the <title> alone.
    expect(html).toContain("Ловим волну");
    expect(html).toContain("Перебираем годы, темы и голубей…");
    expect(html).toContain('lang="ru"');
    // Canonical URL and Open Graph identity for search engines and shares.
    expect(html).toMatch(
      /<link[^>]+rel="canonical"[^>]+href="https:\/\/vau-golub\.ru\/"/,
    );
    expect(html).toMatch(/<meta[^>]+property="og:title"/);
    // Structured data (WebApplication / PodcastSeries / PodcastEpisode graph).
    expect(html).toContain('type="application/ld+json"');
    // Data downloads start from the HTML itself, before the JS bundle runs.
    expect(html).toMatch(
      /<link[^>]+rel="preload"[^>]+href="\/data\/catalog\.json"/,
    );
    expect(html).toMatch(
      /<link[^>]+rel="preload"[^>]+href="\/data\/items-topics\.json"/,
    );
    expect(html).not.toContain("codex-preview");
    expect(html).not.toContain("react-loading-skeleton");
    // Source attribution must reach non-JS crawlers via the noscript block,
    // since the App footer only exists after client hydration.
    expect(html).toContain("<noscript>");
    expect(html).toContain(
      'неофициальный плеер случайных тем и минутных',
    );
    expect(html).toMatch(
      /<a[^>]+href="https:\/\/zavtracast\.ru"[^>]*rel="noopener"/,
    );
  });
});
