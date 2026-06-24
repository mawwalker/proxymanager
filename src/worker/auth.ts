import { getCookie, setCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";

export interface AuthSecrets {
  passwordHash: string;
  sessionSecret: string;
  username: string;
}

export function requireAuth(secrets: AuthSecrets): MiddlewareHandler {
  return async (context, next) => {
    const cookie = getCookie(context, "pm_session");
    const payload = cookie
      ? await verifySessionCookie(cookie, secrets.sessionSecret)
      : null;

    if (!payload || payload.username !== secrets.username || payload.exp < Date.now()) {
      return context.json({ error: "Unauthorized" }, 401);
    }

    await next();
  };
}

export async function verifyCredentials(
  secrets: AuthSecrets,
  input: { password: string; username: string },
): Promise<boolean> {
  if (input.username !== secrets.username) {
    return false;
  }

  const digest = await sha256Hex(input.password);
  return digest === secrets.passwordHash;
}

export async function setSessionCookie(
  context: Context,
  secrets: AuthSecrets,
): Promise<void> {
  const payload = {
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14,
    username: secrets.username,
  };

  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(encoded, secrets.sessionSecret);
  setCookie(context, "pm_session", `${encoded}.${signature}`, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 14,
    path: "/",
    sameSite: "Lax",
    secure: context.req.url.startsWith("https://"),
  });
}

async function verifySessionCookie(
  value: string,
  secret: string,
): Promise<{ exp: number; username: string } | null> {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = await sign(encoded, secret);
  if (expected !== signature) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(encoded)) as {
      exp: number;
      username: string;
    };
  } catch {
    return null;
  }
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const buffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return base64UrlEncode(buffer);
}

async function sha256Hex(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(buffer))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlEncode(value: string | ArrayBuffer): string {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : new Uint8Array(value);
  let text = "";
  bytes.forEach((byte) => {
    text += String.fromCharCode(byte);
  });
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (value.length % 4 || 4)) % 4);
  return atob(padded);
}
