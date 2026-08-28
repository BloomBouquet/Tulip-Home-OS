import { runOfficialDataSyncFromEnv } from "./official-data-sync.ts";

function processEnvironment(): Record<string, string | undefined> {
  const processLike = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  return processLike?.env ?? {};
}

try {
  const result = await runOfficialDataSyncFromEnv(processEnvironment());
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof Error ? error.message : "official data sync failed");
  const processLike = (globalThis as typeof globalThis & {
    process?: { exitCode?: number };
  }).process;
  if (processLike) processLike.exitCode = 1;
}
