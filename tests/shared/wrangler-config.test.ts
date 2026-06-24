import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("wrangler.jsonc", () => {
  it("is committed as a public-safe Cloudflare deployment config", () => {
    const filePath = resolve(process.cwd(), "wrangler.jsonc");
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
      assets: { directory: string; not_found_handling: string };
      d1_databases: Array<{ binding: string; database_id?: string; database_name?: string }>;
      kv_namespaces: Array<{ binding: string; id?: string }>;
      main: string;
      name: string;
      triggers: { crons: string[] };
    };

    expect(parsed.name).toBe("proxymanager");
    expect(parsed.main).toBe("src/worker/index.ts");
    expect(parsed.assets).toEqual({
      directory: "./dist",
      not_found_handling: "single-page-application",
    });
    expect(parsed.d1_databases).toEqual([
      {
        binding: "DB",
      },
    ]);
    expect(parsed.kv_namespaces).toEqual([
      {
        binding: "CACHE",
      },
    ]);
    expect(parsed.triggers.crons).toEqual(["*/15 * * * *"]);
  });
});
