import {
  PROXY_UPSTREAM_HEADER,
  validateUpstreamTarget,
  type UpstreamRejection,
} from "@/features/ai/providers/shared/proxyProtocol";

/**
 * Server-side relay for OpenAI-compatible endpoints that cannot be called from a
 * browser because they omit `Access-Control-Allow-Origin` on real responses.
 *
 * Design constraints:
 *
 * - The caller's own `Authorization` header is forwarded unchanged. This relay
 *   never holds, injects, or logs a provider key of its own, so it stays a
 *   transport hop rather than a credential store.
 * - The upstream is taken from a header, never from a query parameter, and is
 *   re-validated here. A browser-side check is a convenience; this is the
 *   security boundary, because the relay can be called directly.
 * - Loopback and private hosts are always rejected. From a Worker they would
 *   reach the deployment's own network.
 * - The upstream `Host` is not forwarded; fetch derives it from the target.
 * - Streaming responses are passed through untouched. The body is never read,
 *   buffered, or re-encoded, so SSE arrives incrementally and no double
 *   compression happens at the edge.
 */

/** Headers that must not be copied from the browser request to the upstream. */
const DROPPED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "cookie",
  "origin",
  "referer",
  "accept-encoding",
  PROXY_UPSTREAM_HEADER,
]);

/** Headers that must not be copied from the upstream response to the browser. */
const DROPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "set-cookie",
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-expose-headers",
  "vary",
]);

export type RelayResult =
  { ok: true; response: Response } | { ok: false; status: number; message: string };

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message, type: "relay_error" } }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function rejectionMessage(reason: UpstreamRejection): string {
  return reason === "blocked_host"
    ? "That endpoint host is not allowed through this relay."
    : "That endpoint URL is not allowed through this relay.";
}

/**
 * Forwards one request to `upstreamBase + path` and returns the upstream
 * response with streaming preserved.
 *
 * `path` is the part after the relay prefix (for example `/v1/chat/completions`),
 * so a configured base URL and the adapter's paths compose exactly as they do
 * for a direct call.
 */
export async function relayCompatibleRequest(
  request: Request,
  path: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<RelayResult> {
  const rawUpstream = request.headers.get(PROXY_UPSTREAM_HEADER);
  if (!rawUpstream) {
    return { ok: false, status: 400, message: "The relay needs an upstream endpoint." };
  }

  // Loopback is deliberately not permitted here: from the server it is the
  // deployment's own network, not the user's machine.
  const validation = validateUpstreamTarget(rawUpstream, { allowLoopback: false });
  if (!validation.ok) {
    return { ok: false, status: 400, message: rejectionMessage(validation.reason) };
  }

  const suffix = path.startsWith("/") ? path : `/${path}`;
  let target: URL;
  try {
    target = new URL(`${validation.url}${suffix}`);
  } catch {
    return {
      ok: false,
      status: 400,
      message: "That endpoint URL is not allowed through this relay.",
    };
  }
  // Re-check after joining: a crafted base could otherwise smuggle a host.
  if (target.hostname !== new URL(validation.url).hostname) {
    return { ok: false, status: 400, message: rejectionMessage("blocked_host") };
  }
  target.search = new URL(request.url).search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (DROPPED_REQUEST_HEADERS.has(key.toLowerCase())) return;
    headers.set(key, value);
  });

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  const fetchImpl = options.fetchImpl ?? fetch;
  let upstream: Response;
  try {
    upstream = await fetchImpl(target.toString(), {
      method,
      headers,
      // The body is streamed through, not buffered.
      ...(hasBody && request.body ? { body: request.body, duplex: "half" } : {}),
      redirect: "follow",
      signal: request.signal,
    } as RequestInit);
  } catch (error) {
    // The key and URL stay out of the message; the client maps this to its own
    // network_error, which already explains the CORS/connectivity situation.
    const aborted = error instanceof Error && error.name === "AbortError";
    if (aborted) return { ok: false, status: 499, message: "The request was cancelled." };
    return { ok: false, status: 502, message: "The endpoint could not be reached." };
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (DROPPED_RESPONSE_HEADERS.has(key.toLowerCase())) return;
    responseHeaders.set(key, value);
  });
  // This app's origin is the only consumer, and the relay must not be cacheable.
  responseHeaders.set("cache-control", "no-store");

  return {
    ok: true,
    response: new Response(upstream.body, { status: upstream.status, headers: responseHeaders }),
  };
}

export { jsonError };
