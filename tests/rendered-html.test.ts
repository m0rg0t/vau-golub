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
    expect(html).toContain("<title>Синдром Дефицита Вау Голубь</title>");
    expect(html).toContain("Синдром Дефицита");
    expect(html).toContain("Вау Голубь");
    expect(html).toContain('lang="ru"');
    expect(html).not.toContain("codex-preview");
    expect(html).not.toContain("react-loading-skeleton");
  });
});
