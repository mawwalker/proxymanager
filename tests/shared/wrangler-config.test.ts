import { describe, expect, it } from "vitest";

describe("wrangler.jsonc", () => {
  it("is committed as an automatic-provisioning deployment config", async () => {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const rendered = await readFile(resolve(process.cwd(), "wrangler.jsonc"), "utf8");

    const parsed = JSON.parse(rendered) as {
      assets: { directory: string; not_found_handling: string };
      d1_databases: Array<{ binding: string }>;
      kv_namespaces: Array<{ binding: string }>;
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
