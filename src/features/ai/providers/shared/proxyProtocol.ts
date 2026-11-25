/**
 * Contract shared by the browser adapter and the server relay for endpoints
 * that cannot be called cross-origin.
 *
 * Some OpenAI-compatible services send `Access-Control-Allow-Origin` on the
 * preflight `OPTIONS` but omit it on the real response, so a browser refuses the
 * response even though the request itself succeeded. For those endpoints the
 * adapter targets this app's own relay instead, and the real upstream travels in
 * a header. Everything the two sides must agree on lives here.
 *
 * Validation is intentionally duplicated in purpose but not in code: the browser
 * check keeps a bad URL from being saved, and the server check is the one that
 * actually protects the deployment, because a browser check can be bypassed by
 * calling the relay directly.
 */

/** Header carrying the real upstream base URL when the relay is in use. */
export const PROXY_UPSTREAM_HEADER = "x-compat-upstream";

/** Same-origin path the relay is mounted at. */
export const PROXY_BASE_PATH = "/api/compat";

export type UpstreamRejection =
  | "empty"
  | "unparsable"
  | "unsupported_protocol"
  | "embedded_credentials"
  | "insecure_remote"
  | "blocked_host";

export type UpstreamValidation =
  { ok: true; url: string } | { ok: false; reason: UpstreamRejection };

/**
 * Hosts that must never be reachable through the relay: loopback, private
 * ranges, link-local, and internal-only suffixes. Without this an attacker could
 * point the relay at the deployment's own network.
 *
 * This is host-based. It does not resolve DNS, so a public name that resolves to
 * a private address is not caught here; a production deployment should also
 * restrict egress at the network layer.
 */
export function isBlockedHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized) return true;

  if (normalized === "0.0.0.0" || normalized === "::" || normalized === "::1") return true;
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  if (/\.local$/.test(normalized) || /\.internal$/.test(normalized)) return true;
  if (/\.home\.arpa$/.test(normalized)) return true;

  // IPv6 loopback and unique-local / link-local prefixes.
  if (normalized.includes(":")) {
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    return false;
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return true;
  const [a, b] = octets;
  if (a === undefined || b === undefined) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 0) return true;
  return false;
}

/**
 * Validates a user-supplied upstream base URL.
 *
 * `allowLoopback` exists for local runtimes (Ollama, LM Studio) in the browser,
 * where the request never leaves the machine. The server relay always rejects
 * loopback: from a Worker it would mean reaching the deployment's own network.
 */
export function validateUpstreamTarget(
  input: string,
  options: { allowLoopback?: boolean } = {},
): UpstreamValidation {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "empty" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "unparsable" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "unsupported_protocol" };
  }
  if (url.username || url.password) {
    // Credentials belong in the API key field, never in a URL that gets logged.
    return { ok: false, reason: "embedded_credentials" };
  }

  const host = url.hostname.toLowerCase();
  const loopback =
    host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";

  if (url.protocol === "http:" && !(loopback && options.allowLoopback)) {
    return { ok: false, reason: "insecure_remote" };
  }
  if (loopback) {
    if (!options.allowLoopback) return { ok: false, reason: "blocked_host" };
  } else if (isBlockedHost(host)) {
    return { ok: false, reason: "blocked_host" };
  }

  // A query string or fragment in a base URL would corrupt appended paths.
  url.search = "";
  url.hash = "";
  return { ok: true, url: url.toString().replace(/\/+$/, "") };
}

/** Maps a rejection to a short, non-sensitive explanation for logs and errors. */
export function describeUpstreamRejection(reason: UpstreamRejection): string {
  switch (reason) {
    case "empty":
      return "The endpoint URL is missing.";
    case "unparsable":
      return "The endpoint URL is not a valid URL.";
    case "unsupported_protocol":
      return "The endpoint URL must use https.";
    case "embedded_credentials":
      return "Put the API key in the key field, not in the URL.";
    case "insecure_remote":
      return "Remote endpoints must use https.";
    case "blocked_host":
      return "That host cannot be reached through this app's relay.";
  }
}
