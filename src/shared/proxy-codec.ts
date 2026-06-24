import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type ProxyProtocol =
  | "http"
  | "hy2"
  | "hysteria"
  | "socks"
  | "ss"
  | "ssr"
  | "trojan"
  | "tuic"
  | "vless"
  | "vmess"
  | "wireguard"
  | "unknown";

export type ImportKind = "clash" | "raw" | "sing-box";
export type ExportProfile = "clash-meta" | "raw" | "sing-box";
export type ParseStatus = "parsed" | "partial";

export interface NormalizedProxy {
  protocol: ProxyProtocol;
  name?: string;
  server?: string;
  port?: number;
  uuid?: string;
  username?: string;
  password?: string;
  sni?: string;
  tls?: boolean;
  network?: string;
  path?: string;
  host?: string;
  publicKey?: string;
  privateKey?: string;
  ip?: string;
  extras: Record<string, unknown>;
}

export interface ImportedNode {
  id: string;
  fingerprint: string;
  protocol: ProxyProtocol;
  sourceName: string;
  displayName: string;
  rawPayload: string;
  shareUri: string | null;
  parseStatus: ParseStatus;
  tags: string[];
  enabled: boolean;
  normalized: NormalizedProxy;
}

export interface ImportProxyCollectionInput {
  content: string;
  kind: ImportKind;
  sourceName: string;
}

export interface ImportProxyCollectionResult {
  nodes: ImportedNode[];
}

export interface ExportSkippedItem {
  id: string;
  name: string;
  reason: string;
}

export interface ExportSubscriptionProfileResult {
  content: string;
  mediaType: string;
  skipped: ExportSkippedItem[];
}

export async function importProxyCollection(
  input: ImportProxyCollectionInput,
): Promise<ImportProxyCollectionResult> {
  const rawNodes =
    input.kind === "raw"
      ? parseRawCollection(input.content)
      : input.kind === "clash"
        ? parseClashCollection(input.content)
        : parseSingBoxCollection(input.content);

  const nodes = await Promise.all(
    rawNodes.map(async (node) => {
      const fingerprint = await digestHex(
        JSON.stringify({
          normalized: node.normalized,
          rawPayload: node.rawPayload,
          shareUri: node.shareUri,
        }),
      );

      return {
        ...node,
        id: `node_${fingerprint.slice(0, 16)}`,
        fingerprint,
        sourceName: input.sourceName,
      } satisfies ImportedNode;
    }),
  );

  return { nodes };
}

export function exportSubscriptionProfile(
  profile: ExportProfile,
  nodes: ImportedNode[],
): ExportSubscriptionProfileResult {
  if (profile === "raw") {
    const content = nodes
      .map((node) => node.shareUri ?? node.rawPayload)
      .join("\n");

    return {
      content,
      mediaType: "text/plain; charset=utf-8",
      skipped: [],
    };
  }

  if (profile === "clash-meta") {
    const converted: Record<string, unknown>[] = [];
    const skipped: ExportSkippedItem[] = [];

    for (const node of nodes) {
      const proxy = toClashProxy(node);
      if (proxy) {
        converted.push(proxy);
        continue;
      }

      skipped.push({
        id: node.id,
        name: node.displayName,
        reason: "Protocol is not supported by clash-meta export.",
      });
    }

    const names = converted
      .map((item) => item.name)
      .filter((value): value is string => typeof value === "string");

    return {
      content: stringifyYaml({
        mixed_port: 7890,
        mode: "rule",
        proxies: converted,
        "proxy-groups": [
          {
            name: "ProxyManager",
            type: "select",
            proxies: names,
          },
        ],
      }),
      mediaType: "text/yaml; charset=utf-8",
      skipped,
    };
  }

  const outbounds = nodes
    .map((node) => toSingBoxOutbound(node))
    .filter((item): item is Record<string, unknown> => item !== null);
  const skipped = nodes
    .filter((node) => toSingBoxOutbound(node) === null)
    .map((node) => ({
      id: node.id,
      name: node.displayName,
      reason: "Protocol is not supported by sing-box export.",
    }));

  return {
    content: JSON.stringify(
      {
        log: { level: "warn" },
        outbounds: [
          {
            type: "selector",
            tag: "ProxyManager",
            outbounds: outbounds
              .map((item) => item.tag)
              .filter((value): value is string => typeof value === "string"),
          },
          ...outbounds,
        ],
      },
      null,
      2,
    ),
    mediaType: "application/json; charset=utf-8",
    skipped,
  };
}

function parseRawCollection(content: string): Array<Omit<ImportedNode, "fingerprint" | "id" | "sourceName">> {
  const decoded = maybeDecodeBase64Subscription(content.trim());

  return decoded
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map(parseProxyUriLine);
}

function parseProxyUriLine(line: string): Omit<ImportedNode, "fingerprint" | "id" | "sourceName"> {
  if (line.startsWith("vmess://")) {
    return parseVmessUri(line);
  }

  const scheme = line.slice(0, line.indexOf("://")).toLowerCase();
  const protocol = normalizeProtocol(scheme);
  const url = new URL(line);
  const displayName = decodeURIComponent(url.hash.replace(/^#/, "")) || `${protocol}-${url.hostname}`;
  const tls = readBoolean(url.searchParams.get("security") ?? url.searchParams.get("tls"));
  const normalized: NormalizedProxy = {
    protocol,
    name: displayName,
    server: url.hostname,
    port: parsePort(url.port),
    username: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    uuid:
      protocol === "vless" || protocol === "tuic"
        ? decodeURIComponent(url.username || "")
        : undefined,
    sni:
      url.searchParams.get("sni") ??
      url.searchParams.get("peer") ??
      undefined,
    tls,
    network:
      url.searchParams.get("type") ??
      url.searchParams.get("network") ??
      undefined,
    path: url.searchParams.get("path") ?? undefined,
    host: url.searchParams.get("host") ?? undefined,
    extras: collectQueryExtras(url.searchParams),
  };

  return {
    protocol,
    displayName,
    rawPayload: line,
    shareUri: line,
    parseStatus: "parsed",
    tags: [],
    enabled: true,
    normalized,
  };
}

function parseVmessUri(line: string): Omit<ImportedNode, "fingerprint" | "id" | "sourceName"> {
  const payload = line.slice("vmess://".length);
  const parsed = JSON.parse(decodeBase64(payload)) as Record<string, string>;
  const displayName = parsed.ps || parsed.add || "vmess";

  return {
    protocol: "vmess",
    displayName,
    rawPayload: line,
    shareUri: line,
    parseStatus: "parsed",
    tags: [],
    enabled: true,
    normalized: {
      protocol: "vmess",
      name: displayName,
      server: parsed.add,
      port: parsePort(parsed.port),
      uuid: parsed.id,
      tls: parsed.tls === "tls",
      host: parsed.host,
      path: parsed.path,
      network: parsed.net,
      extras: parsed,
    },
  };
}

function parseClashCollection(
  content: string,
): Array<Omit<ImportedNode, "fingerprint" | "id" | "sourceName">> {
  const parsed = parseYaml(content) as { proxies?: Array<Record<string, unknown>> };
  const proxies = parsed.proxies ?? [];

  return proxies.map((proxy) => {
    const protocol = normalizeProtocol(String(proxy.type ?? "unknown"));
    const displayName = String(proxy.name ?? `${protocol}-node`);
    const normalized: NormalizedProxy = {
      protocol,
      name: displayName,
      server: stringOrUndefined(proxy.server),
      port: parsePort(proxy.port),
      uuid: stringOrUndefined(proxy.uuid),
      password: stringOrUndefined(proxy.password),
      username: stringOrUndefined(proxy.username),
      sni: stringOrUndefined(proxy.servername),
      tls: readBoolean(proxy.tls),
      network: stringOrUndefined(proxy.network),
      path: readNestedPath(proxy),
      host: readNestedHost(proxy),
      publicKey: stringOrUndefined(proxy["public-key"]),
      privateKey: stringOrUndefined(proxy["private-key"]),
      ip: stringOrUndefined(proxy.ip),
      extras: proxy,
    };

    return {
      protocol,
      displayName,
      rawPayload: JSON.stringify(proxy),
      shareUri: serializeShareUri(normalized),
      parseStatus: protocol === "unknown" ? "partial" : "parsed",
      tags: [],
      enabled: true,
      normalized,
    };
  });
}

function parseSingBoxCollection(
  content: string,
): Array<Omit<ImportedNode, "fingerprint" | "id" | "sourceName">> {
  const parsed = JSON.parse(content) as {
    outbounds?: Array<Record<string, unknown>>;
  };

  return (parsed.outbounds ?? [])
    .filter((outbound) => !["block", "direct", "dns", "selector", "urltest"].includes(String(outbound.type)))
    .map((outbound) => {
      const protocol = normalizeProtocol(String(outbound.type ?? "unknown"));
      const displayName = String(outbound.tag ?? outbound.server ?? `${protocol}-node`);
      const normalized: NormalizedProxy = {
        protocol,
        name: displayName,
        server: stringOrUndefined(outbound.server),
        port: parsePort(outbound.server_port),
        uuid: stringOrUndefined(outbound.uuid),
        password: stringOrUndefined(outbound.password),
        username: stringOrUndefined(outbound.username),
        sni: readTlsServerName(outbound.tls),
        tls: readTlsEnabled(outbound.tls),
        network: stringOrUndefined(outbound.transport),
        path: stringOrUndefined(outbound.path),
        host: stringOrUndefined(outbound.host),
        extras: outbound,
      };

      return {
        protocol,
        displayName,
        rawPayload: JSON.stringify(outbound),
        shareUri: serializeShareUri(normalized),
        parseStatus: protocol === "unknown" ? "partial" : "parsed",
        tags: [],
        enabled: true,
        normalized,
      };
    });
}

function serializeShareUri(normalized: NormalizedProxy): string | null {
  const { protocol } = normalized;
  if (!normalized.server || !normalized.port) {
    return null;
  }

  if (protocol === "trojan") {
    const url = new URL(`trojan://${encodeURIComponent(normalized.password ?? "")}@${normalized.server}:${normalized.port}`);
    if (normalized.sni) url.searchParams.set("sni", normalized.sni);
    if (normalized.tls) url.searchParams.set("security", "tls");
    if (normalized.name) url.hash = encodeURIComponent(normalized.name);
    return url.toString();
  }

  if (protocol === "vless") {
    const url = new URL(`vless://${normalized.uuid ?? ""}@${normalized.server}:${normalized.port}`);
    url.searchParams.set("encryption", "none");
    if (normalized.tls) url.searchParams.set("security", "tls");
    if (normalized.sni) url.searchParams.set("sni", normalized.sni);
    if (normalized.network) url.searchParams.set("type", normalized.network);
    if (normalized.path) url.searchParams.set("path", normalized.path);
    if (normalized.host) url.searchParams.set("host", normalized.host);
    if (normalized.name) url.hash = encodeURIComponent(normalized.name);
    return url.toString();
  }

  if (protocol === "hy2" || protocol === "hysteria") {
    const scheme = protocol === "hy2" ? "hysteria2" : "hysteria";
    const url = new URL(`${scheme}://${encodeURIComponent(normalized.password ?? "")}@${normalized.server}:${normalized.port}`);
    if (normalized.sni) url.searchParams.set("sni", normalized.sni);
    if (normalized.name) url.hash = encodeURIComponent(normalized.name);
    return url.toString();
  }

  if (protocol === "tuic") {
    const url = new URL(`tuic://${normalized.uuid ?? normalized.username ?? ""}:${encodeURIComponent(normalized.password ?? "")}@${normalized.server}:${normalized.port}`);
    if (normalized.name) url.hash = encodeURIComponent(normalized.name);
    return url.toString();
  }

  if (protocol === "socks" || protocol === "http") {
    const url = new URL(`${protocol}://${encodeURIComponent(normalized.username ?? "")}:${encodeURIComponent(normalized.password ?? "")}@${normalized.server}:${normalized.port}`);
    if (normalized.name) url.hash = encodeURIComponent(normalized.name);
    return url.toString();
  }

  if (protocol === "vmess") {
    const vmessPayload = {
      v: "2",
      ps: normalized.name ?? "vmess",
      add: normalized.server,
      port: String(normalized.port),
      id: normalized.uuid ?? "",
      aid: "0",
      net: normalized.network ?? "tcp",
      type: "none",
      host: normalized.host ?? "",
      path: normalized.path ?? "",
      tls: normalized.tls ? "tls" : "",
    };

    return `vmess://${encodeBase64(JSON.stringify(vmessPayload))}`;
  }

  return null;
}

function toClashProxy(node: ImportedNode): Record<string, unknown> | null {
  const n = node.normalized;
  if (!n.server || !n.port) {
    return null;
  }

  if (node.protocol === "vless") {
    return {
      name: node.displayName,
      type: "vless",
      server: n.server,
      port: n.port,
      uuid: n.uuid,
      tls: Boolean(n.tls),
      servername: n.sni,
      network: n.network,
      "ws-opts": n.path || n.host ? { path: n.path ?? "/", headers: { Host: n.host ?? n.sni ?? n.server } } : undefined,
    };
  }

  if (node.protocol === "trojan") {
    return {
      name: node.displayName,
      type: "trojan",
      server: n.server,
      port: n.port,
      password: n.password,
      sni: n.sni,
    };
  }

  if (node.protocol === "tuic") {
    return {
      name: node.displayName,
      type: "tuic",
      server: n.server,
      port: n.port,
      uuid: n.uuid ?? n.username,
      password: n.password,
      "congestion-controller": n.extras.congestion_control ?? "bbr",
    };
  }

  if (node.protocol === "socks" || node.protocol === "http") {
    return {
      name: node.displayName,
      type: node.protocol,
      server: n.server,
      port: n.port,
      username: n.username,
      password: n.password,
    };
  }

  if (node.protocol === "vmess") {
    return {
      name: node.displayName,
      type: "vmess",
      server: n.server,
      port: n.port,
      uuid: n.uuid,
      alterId: 0,
      cipher: "auto",
      tls: Boolean(n.tls),
      servername: n.sni,
      network: n.network,
      "ws-opts": n.path || n.host ? { path: n.path ?? "/", headers: { Host: n.host ?? n.server } } : undefined,
    };
  }

  if (node.protocol === "hy2") {
    return {
      name: node.displayName,
      type: "hysteria2",
      server: n.server,
      port: n.port,
      password: n.password,
      sni: n.sni,
    };
  }

  return null;
}

function toSingBoxOutbound(node: ImportedNode): Record<string, unknown> | null {
  const n = node.normalized;
  if (!n.server || !n.port) {
    return null;
  }

  if (node.protocol === "trojan") {
    return {
      type: "trojan",
      tag: node.displayName,
      server: n.server,
      server_port: n.port,
      password: n.password,
      tls: {
        enabled: Boolean(n.tls),
        server_name: n.sni,
      },
    };
  }

  if (node.protocol === "socks") {
    return {
      type: "socks",
      tag: node.displayName,
      server: n.server,
      server_port: n.port,
      username: n.username,
      password: n.password,
    };
  }

  if (node.protocol === "vless") {
    return {
      type: "vless",
      tag: node.displayName,
      server: n.server,
      server_port: n.port,
      uuid: n.uuid,
      tls: {
        enabled: Boolean(n.tls),
        server_name: n.sni,
      },
      transport:
        n.network === "ws"
          ? {
              type: "ws",
              path: n.path ?? "/",
              headers: n.host ? { Host: n.host } : undefined,
            }
          : undefined,
    };
  }

  if (node.protocol === "hy2") {
    return {
      type: "hysteria2",
      tag: node.displayName,
      server: n.server,
      server_port: n.port,
      password: n.password,
      tls: {
        enabled: Boolean(n.tls),
        server_name: n.sni,
      },
    };
  }

  if (node.protocol === "http") {
    return {
      type: "http",
      tag: node.displayName,
      server: n.server,
      server_port: n.port,
      username: n.username,
      password: n.password,
    };
  }

  return null;
}

function maybeDecodeBase64Subscription(content: string): string {
  if (content.includes("://") || content.includes("\n")) {
    return content;
  }

  try {
    const decoded = decodeBase64(content);
    return decoded.includes("://") ? decoded : content;
  } catch {
    return content;
  }
}

function decodeBase64(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(normalized);
}

function encodeBase64(value: string): string {
  return btoa(value);
}

function normalizeProtocol(value: string): ProxyProtocol {
  const protocol = value.toLowerCase();

  if (protocol === "hysteria2") return "hy2";
  if (protocol === "socks5") return "socks";
  if (protocol === "https") return "http";
  if (
    [
      "http",
      "hy2",
      "hysteria",
      "socks",
      "ss",
      "ssr",
      "trojan",
      "tuic",
      "vless",
      "vmess",
      "wireguard",
    ].includes(protocol)
  ) {
    return protocol as ProxyProtocol;
  }

  return "unknown";
}

function collectQueryExtras(searchParams: URLSearchParams): Record<string, unknown> {
  return Array.from(searchParams.entries()).reduce<Record<string, unknown>>(
    (accumulator, [key, value]) => {
      accumulator[key] = value;
      return accumulator;
    },
    {},
  );
}

function readNestedPath(proxy: Record<string, unknown>): string | undefined {
  const wsOptions = proxy["ws-opts"] as { path?: string } | undefined;
  return wsOptions?.path;
}

function readNestedHost(proxy: Record<string, unknown>): string | undefined {
  const wsOptions = proxy["ws-opts"] as
    | { headers?: Record<string, string> }
    | undefined;
  return wsOptions?.headers?.Host;
}

function readTlsServerName(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return stringOrUndefined((value as Record<string, unknown>).server_name);
}

function readTlsEnabled(value: unknown): boolean | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return readBoolean((value as Record<string, unknown>).enabled);
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["1", "tls", "true", "yes"].includes(value.toLowerCase());
  }

  return undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parsePort(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

async function digestHex(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
