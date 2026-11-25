import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { jsonError, relayCompatibleRequest } from "./features/ai/server/compatibleRelay";
import { PROXY_BASE_PATH } from "./features/ai/providers/shared/proxyProtocol";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

/**
 * Relay for OpenAI-compatible endpoints that cannot be called from the browser
 * because they omit `Access-Control-Allow-Origin` on real responses.
 *
 * Handled before the router: this is a transport hop, not a page, and it must
 * pass a streaming body straight through without any route-level processing.
 * Only `GET` and `POST` are forwarded, which is everything the Chat Completions
 * and Models endpoints need.
 */
async function handleCompatibleRelay(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(`${PROXY_BASE_PATH}/`)) {
    return jsonError(404, "Not found.");
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
  }

  const path = url.pathname.slice(PROXY_BASE_PATH.length);
  const result = await relayCompatibleRequest(request, path);
  return result.ok ? result.response : jsonError(result.status, result.message);
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Hosting compresses every response at the edge. Never compress a body (gzip, brotli,
// CompressionStream) or set content-encoding here or in a server route: the body gets encoded
// twice and renders garbled.
export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const pathname = new URL(request.url).pathname;
      if (pathname.startsWith(`${PROXY_BASE_PATH}/`)) {
        return await handleCompatibleRelay(request);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
