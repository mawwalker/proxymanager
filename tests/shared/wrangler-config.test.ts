import { describe, expect, it } from "vitest";

import {
  renderWranglerConfig,
  resolveWranglerBuildEnv,
} from "../../scripts/render-wrangler.mjs";

describe("resolveWranglerBuildEnv", () => {
  it("extracts required build variables and applies defaults", () => {
    const resolved = resolveWranglerBuildEnv({
      CF_D1_ID: "d1-real-id",
      CF_KV_ID: "kv-real-id",
    });

    expect(resolved).toEqual({
      cronSchedule: "*/15 * * * *",
      d1DatabaseId: "d1-real-id",
      d1DatabaseName: "proxymanager",
      kvNamespaceId: "kv-real-id",
      workerName: "proxymanager",
    });
  });

  it("throws a helpful error when required variables are missing", () => {
    expect(() =>
      resolveWranglerBuildEnv({
        CF_D1_ID: "d1-real-id",
      }),
    ).toThrowError(
      "Missing required Cloudflare build variables: CF_KV_ID",
    );
  });
});

describe("renderWranglerConfig", () => {
  it("renders a deployable wrangler config from build variables", () => {
    const rendered = renderWranglerConfig({
      cronSchedule: "0 */1 * * *",
      d1DatabaseId: "d1-real-id",
      d1DatabaseName: "proxy-db",
      kvNamespaceId: "kv-real-id",
      workerName: "proxy-public-template",
    });

    const parsed = JSON.parse(rendered) as {
      assets: { directory: string; not_found_handling: string };
      d1_databases: Array<{ binding: string; database_id: string; database_name: string }>;
      kv_namespaces: Array<{ binding: string; id: string }>;
      name: string;
      triggers: { crons: string[] };
    };

    expect(parsed.name).toBe("proxy-public-template");
    expect(parsed.assets).toEqual({
      directory: "./dist",
      not_found_handling: "single-page-application",
    });
    expect(parsed.d1_databases[0]).toEqual({
      binding: "DB",
      database_id: "d1-real-id",
      database_name: "proxy-db",
      migrations_dir: "migrations",
    });
    expect(parsed.kv_namespaces[0]).toEqual({
      binding: "CACHE",
      id: "kv-real-id",
    });
    expect(parsed.triggers.crons).toEqual(["0 */1 * * *"]);
  });
});
