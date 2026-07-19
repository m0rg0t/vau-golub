import { createWriteStream } from "node:fs";
import { execFile } from "node:child_process";
import { access, mkdir, rename, stat, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import { requestedEpisode } from "./lib/files";
import { loadSelectedEpisodes, projectRoot } from "./lib/catalog";

const execFileAsync = promisify(execFile);

async function existsWithBytes(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

async function isPlayableAudio(path: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    return stdout.trim() === "audio";
  } catch {
    return false;
  }
}

export async function downloadFile(
  url: string,
  path: string,
  expectedContent: "audio" | "image",
  fetchImplementation: typeof fetch = fetch,
  validateFile: (path: string) => Promise<boolean> = existsWithBytes,
): Promise<void> {
  if (await validateFile(path)) {
    return;
  }

  const response = await fetchImplementation(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed for ${url}: HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    !contentType.includes(expectedContent) &&
    !(expectedContent === "audio" && contentType.includes("octet-stream"))
  ) {
    throw new Error(
      `Download for ${url} returned unexpected content type "${contentType}"`,
    );
  }

  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.partial`;
  try {
    await pipeline(
      Readable.from(
        response.body as unknown as AsyncIterable<Uint8Array>,
      ),
      createWriteStream(temporaryPath),
    );
    const expectedBytes = Number(response.headers.get("content-length"));
    const actualBytes = (await stat(temporaryPath)).size;
    if (
      Number.isFinite(expectedBytes) &&
      expectedBytes > 0 &&
      expectedBytes !== actualBytes
    ) {
      throw new Error(
        `Truncated download for ${url}: ${actualBytes}/${expectedBytes} bytes`,
      );
    }
    if (!(await validateFile(temporaryPath))) {
      throw new Error(`Downloaded file failed validation: ${url}`);
    }
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function main(): Promise<void> {
  const episodes = await loadSelectedEpisodes(requestedEpisode());
  const coversOnly = process.argv.includes("--covers-only");

  for (const episode of episodes) {
    const audioPath = resolve(projectRoot, ".cache", "audio", `${episode.id}.mp3`);
    const coverPath = resolve(
      projectRoot,
      "public",
      episode.localCoverPath.slice(1),
    );

    if (!coversOnly) {
      await downloadFile(
        episode.audioUrl,
        audioPath,
        "audio",
        fetch,
        isPlayableAudio,
      );
      await access(audioPath);
    }
    await downloadFile(episode.coverSourceUrl, coverPath, "image");
    await access(coverPath);
    process.stdout.write(
      `✓ ${episode.id}: ${coversOnly ? "обложка готова" : "MP3 и обложка готовы"}\n`,
    );
  }
}

if (import.meta.main) {
  await main();
}
