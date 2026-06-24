import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULTS = {
  cronSchedule: "*/15 * * * *",
  d1DatabaseName: "proxymanager",
  workerName: "proxymanager",
};

export function resolveWranglerBuildEnv(rawEnv) {
  const missing = ["CF_D1_ID", "CF_KV_ID"].filter((key) => {
    const value = rawEnv[key];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required Cloudflare build variables: ${missing.join(", ")}`,
    );
  }

  return {
    cronSchedule: readOptional(rawEnv.CF_CRON_SCHEDULE) ?? DEFAULTS.cronSchedule,
    d1DatabaseId: rawEnv.CF_D1_ID.trim(),
    d1DatabaseName:
      readOptional(rawEnv.CF_D1_NAME) ?? DEFAULTS.d1DatabaseName,
    kvNamespaceId: rawEnv.CF_KV_ID.trim(),
    workerName: readOptional(rawEnv.CF_WORKER_NAME) ?? DEFAULTS.workerName,
  };
}

export function renderWranglerConfig(config) {
  return `${JSON.stringify(
    {
      assets: {
        directory: "./dist",
        not_found_handling: "single-page-application",
      },
      compatibility_date: "2026-06-24",
      d1_databases: [
        {
          binding: "DB",
          database_id: config.d1DatabaseId,
          database_name: config.d1DatabaseName,
          migrations_dir: "migrations",
        },
      ],
      kv_namespaces: [
        {
          binding: "CACHE",
          id: config.kvNamespaceId,
        },
      ],
      main: "src/worker/index.ts",
      name: config.workerName,
      triggers: {
        crons: [config.cronSchedule],
      },
    },
    null,
    2,
  )}\n`;
}

export function writeWranglerConfig({
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const resolved = resolveWranglerBuildEnv(env);
  const content = renderWranglerConfig(resolved);
  const targetPath = join(cwd, "wrangler.jsonc");

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, "utf8");
  return targetPath;
}

function readOptional(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && currentFile === process.argv[1]) {
  const outputPath = writeWranglerConfig();
  console.log(`Generated ${outputPath}`);
}
