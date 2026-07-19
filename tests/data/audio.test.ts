import { describe, expect, it, vi } from "vitest";

import { verifyAudioRange } from "../../scripts/verify-audio";
import type { EpisodeMetadata } from "../../src/domain/schema";

const episode = {
  id: "zc-2",
  audioUrl: "https://example.com/zavtracast2.mp3",
} as EpisodeMetadata;

describe("audio range verification", () => {
  it("accepts a valid partial audio response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array(1024), {
        status: 206,
        headers: {
          "content-type": "audio/mpeg",
          "content-range": "bytes 0-1023/2048",
        },
      }),
    );

    await expect(verifyAudioRange(episode, fetchMock)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(episode.audioUrl, {
      headers: { Range: "bytes=0-1023" },
      redirect: "follow",
    });
  });

  it("rejects servers that ignore range requests", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array(1024), {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      }),
    );

    await expect(verifyAudioRange(episode, fetchMock)).rejects.toThrow(
      "expected HTTP 206",
    );
  });
});
