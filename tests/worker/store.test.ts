import { describe, expect, it } from "vitest";

import { createD1Store } from "@worker/store";

describe("createD1Store", () => {
  it("throws a clear error when the DB binding is missing", async () => {
    const store = createD1Store(undefined as unknown as D1Database);

    await expect(store.getDashboard()).rejects.toThrow(
      "D1 binding DB is not configured in Cloudflare Worker settings.",
    );
  });

  it("bootstraps the schema before serving D1-backed queries", async () => {
    const preparedSql: string[] = [];
    const runCalls: string[] = [];
    let activeRuns = 0;
    let maxConcurrentRuns = 0;
    const db = {
      prepare: (sql: string) => {
        preparedSql.push(sql);
        return {
          all: async () => ({ results: [] }),
          bind() {
            return this;
          },
          first: async () => null,
          run: async () => {
            activeRuns += 1;
            maxConcurrentRuns = Math.max(maxConcurrentRuns, activeRuns);
            runCalls.push(sql);
            await Promise.resolve();
            activeRuns -= 1;
            return { success: true };
          },
        };
      },
    } as unknown as D1Database;

    const store = createD1Store(db);

    await store.getDashboard();
    await store.getDashboard();

    expect(runCalls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("create table if not exists proxy_nodes"),
        expect.stringContaining("create table if not exists sources"),
        expect.stringContaining("create table if not exists source_nodes"),
        expect.stringContaining("create table if not exists subscriptions"),
        expect.stringContaining("create table if not exists subscription_items"),
      ]),
    );
    expect(runCalls).toHaveLength(9);
    expect(maxConcurrentRuns).toBe(1);
    expect(preparedSql).toContain("select * from proxy_nodes order by updated_at desc");
  });
});
