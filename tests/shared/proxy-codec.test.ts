import { describe, expect, it } from "vitest";

import {
  exportSubscriptionProfile,
  importProxyCollection,
} from "@shared/proxy-codec";

describe("importProxyCollection", () => {
  it("parses raw URI lists and base64 subscriptions", async () => {
    const payload = Buffer.from(
      [
        "vless://11111111-1111-1111-1111-111111111111@hk.example.com:443?encryption=none&security=tls&sni=hk.example.com#HK%20Edge",
        "trojan://secret@example.org:443?security=tls#Trojan%20Core",
      ].join("\n"),
      "utf8",
    ).toString("base64");

    const result = await importProxyCollection({
      content: payload,
      kind: "raw",
      sourceName: "shared-base64",
    });

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.map((node) => node.protocol)).toEqual([
      "vless",
      "trojan",
    ]);
    expect(result.nodes[0]?.displayName).toBe("HK Edge");
    expect(result.nodes[1]?.shareUri).toContain("trojan://");
  });

  it("parses clash style subscriptions and preserves node metadata", async () => {
    const clashYaml = `
proxies:
  - name: Tokyo Prime
    type: vless
    server: jp.example.com
    port: 443
    uuid: 22222222-2222-2222-2222-222222222222
    tls: true
    servername: cdn.example.com
    network: ws
    ws-opts:
      path: /ray
  - name: WG Edge
    type: wireguard
    server: wg.example.com
    port: 2408
    ip: 172.16.0.2
    private-key: private-key
    public-key: public-key
`;

    const result = await importProxyCollection({
      content: clashYaml,
      kind: "clash",
      sourceName: "friend-clash",
    });

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]?.protocol).toBe("vless");
    expect(result.nodes[1]?.protocol).toBe("wireguard");
    expect(result.nodes[1]?.shareUri).toBeNull();
    expect(result.nodes[1]?.rawPayload).toContain("\"type\":\"wireguard\"");
  });

  it("parses sing-box outbounds", async () => {
    const singBoxJson = JSON.stringify({
      outbounds: [
        {
          type: "hysteria2",
          tag: "HY2 Fast",
          server: "hy.example.com",
          server_port: 443,
          password: "super-secret",
          tls: {
            enabled: true,
            server_name: "hy.example.com",
          },
        },
      ],
    });

    const result = await importProxyCollection({
      content: singBoxJson,
      kind: "sing-box",
      sourceName: "sb-team",
    });

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.protocol).toBe("hy2");
    expect(result.nodes[0]?.displayName).toBe("HY2 Fast");
    expect(result.nodes[0]?.normalized.server).toBe("hy.example.com");
  });
});

describe("exportSubscriptionProfile", () => {
  it("builds a clash-meta profile and reports skipped nodes", async () => {
    const imported = await importProxyCollection({
      content: [
        "vless://11111111-1111-1111-1111-111111111111@hk.example.com:443?encryption=none&security=tls&sni=hk.example.com#HK",
        "tuic://user:password@tuic.example.com:443?congestion_control=bbr#TUIC",
      ].join("\n"),
      kind: "raw",
      sourceName: "mixed-raw",
    });

    imported.nodes.push({
      id: "unsupported",
      fingerprint: "unsupported",
      protocol: "unknown",
      sourceName: "mixed-raw",
      displayName: "Legacy",
      rawPayload: "{\"type\":\"custom\"}",
      shareUri: null,
      parseStatus: "partial",
      tags: [],
      enabled: true,
      normalized: {
        protocol: "unknown",
        name: "Legacy",
        extras: {},
      },
    });

    const result = exportSubscriptionProfile("clash-meta", imported.nodes);

    expect(result.content).toContain("proxies:");
    expect(result.content).toContain("type: vless");
    expect(result.content).toContain("type: tuic");
    expect(result.skipped).toEqual([
      {
        id: "unsupported",
        name: "Legacy",
        reason: "Protocol is not supported by clash-meta export.",
      },
    ]);
  });

  it("builds a sing-box profile with an outbound selector", async () => {
    const imported = await importProxyCollection({
      content: [
        "trojan://secret@sg.example.com:443?security=tls&sni=sg.example.com#SG",
        "socks://user:pass@127.0.0.1:1080#SOCKS",
      ].join("\n"),
      kind: "raw",
      sourceName: "sing-box-ready",
    });

    const result = exportSubscriptionProfile("sing-box", imported.nodes);
    const parsed = JSON.parse(result.content) as {
      outbounds: Array<Record<string, unknown>>;
    };

    expect(parsed.outbounds[0]?.type).toBe("selector");
    expect(parsed.outbounds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "trojan", tag: "SG" }),
        expect.objectContaining({ type: "socks", tag: "SOCKS" }),
      ]),
    );
    expect(result.skipped).toHaveLength(0);
  });
});
