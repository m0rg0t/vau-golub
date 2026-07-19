import { resolve } from "node:path";

import { loadSelectedEpisodes, projectRoot } from "./lib/catalog";
import { validateEpisodeData } from "./lib/editorial";
import { argumentValue, readJson } from "./lib/files";

async function main(): Promise<void> {
  const episodes = await loadSelectedEpisodes(argumentValue("--episode"));

  for (const metadata of episodes) {
    const directory = resolve(projectRoot, "data", "episodes", metadata.id);
    const result = validateEpisodeData(
      metadata,
      await readJson(resolve(directory, "transcript.json")),
      await readJson(resolve(directory, "editorial.json")),
    );
    process.stdout.write(
      `✓ ${metadata.id}: ${result.editorial.topics.length} тем, ${result.minuteClips.length} минут\n`,
    );
  }
}

if (import.meta.main) {
  await main();
}
