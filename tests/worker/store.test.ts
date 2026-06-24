import { describe, expect, it } from "vitest";

import { createD1Store } from "@worker/store";

describe("createD1Store", () => {
  it("bootstraps the schema before serving D1-backed queries", async () => {
    const execCalls: string[] = [];
    const preparedSql: string[] = [];
    const db = {
      exec: async (sql: string) => {
        execCalls.push(sql);
      },
      prepare: (sql: string) => {
        preparedSql.push(sql);
        return {
          all: async () => ({ results: [] }),
          bind() {
            return this;
          },
          first: async () => null,
          run: async () => ({ success: true }),
        };
      },
    } as unknown as D1Database;

    const store = createD1Store(db);

    await store.getDashboard();
    await store.getDashboard();

    expect(execCalls).toHaveLength(1);
    expect(execCalls[0]).toContain("create table if not exists proxy_nodes");
    expect(preparedSql).toContain("select * from proxy_nodes order by updated_at desc");
  });
});
