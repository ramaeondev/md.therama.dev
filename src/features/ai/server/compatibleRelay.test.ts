import { describe, expect, it, vi } from "vitest";
import { relayCompatibleRequest } from "./compatibleRelay";
import {
  PROXY_BASE_PATH,
  PROXY_UPSTREAM_HEADER,
  isBlockedHost,
  validateUpstreamTarget,
} from "@/features/ai/providers/shared/proxyProtocol";

const UPSTREAM = "https://api.example.com/v1";

function relayRequest(
  init: {
    method?: string;
    body?: string | null;
    headers?: Record<string, string>;
    url?: string;
  } = {},
): Request {
  return new Request(init.url ?? `https://md.therama.dev${PROXY_BASE_PATH}/v1/chat/completions`, {
    method: init.method ?? "POST",
    ...(init.body !== undefined ? { body: init.body } : {}),
    headers: {
      authorization: "Bearer user-key",
      "content-type": "application/json",
      [PROXY_UPSTREAM_HEADER]: UPSTREAM,
      ...init.headers,
    },
  });
}

function okJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("relay upstream validation", () => {
  it("forwards to the upstream base plus the relayed path", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ data: [] }));
    const result = await relayCompatibleRequest(relayRequest({ body: "{}" }), "/v1/models", {
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${UPSTREAM}/v1/models`);
  });

  it("forwards the caller's own authorization header and never adds one", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ data: [] }));
    await relayCompatibleRequest(relayRequest({ body: "{}" }), "/v1/models", { fetchImpl });

    const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer user-key");
  });

  it("strips the upstream header, origin, cookies and encoding hints", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ data: [] }));
    await relayCompatibleRequest(
      relayRequest({
        body: "{}",
        headers: {
          origin: "https://md.therama.dev",
          cookie: "session=abc",
          "accept-encoding": "gzip",
        },
      }),
      "/v1/models",
      { fetchImpl },
    );

    const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
    expect(headers.get(PROXY_UPSTREAM_HEADER)).toBeNull();
    expect(headers.get("origin")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("accept-encoding")).toBeNull();
  });

  it("rejects a request with no upstream header", async () => {
    const request = new Request(`https://md.therama.dev${PROXY_BASE_PATH}/v1/models`);
    const result = await relayCompatibleRequest(request, "/v1/models", { fetchImpl: vi.fn() });

    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it.each([
    ["http://api.example.com/v1", "insecure_remote"],
    ["http://localhost:11434/v1", "insecure_remote"],
    ["http://127.0.0.1:1234/v1", "insecure_remote"],
    ["https://127.0.0.1:1234/v1", "blocked_host"],
    ["https://localhost/v1", "blocked_host"],
    ["https://192.168.1.10/v1", "blocked_host"],
    ["https://10.0.0.5/v1", "blocked_host"],
    ["https://169.254.169.254/latest", "blocked_host"],
    ["https://user:pass@api.example.com/v1", "embedded_credentials"],
    ["ftp://api.example.com/v1", "unsupported_protocol"],
    ["not a url", "unparsable"],
  ])("rejects %s (%s)", async (upstream, reason) => {
    const fetchImpl = vi.fn();
    const result = await relayCompatibleRequest(
      relayRequest({ body: "{}", headers: { [PROXY_UPSTREAM_HEADER]: upstream } }),
      "/v1/models",
      { fetchImpl },
    );

    expect(validateUpstreamTarget(upstream, { allowLoopback: false })).toMatchObject({ reason });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never lets loopback through, even though the browser allows it locally", async () => {
    // The browser permits loopback for local runtimes; from the server it would
    // reach the deployment's own network, so the relay must not.
    expect(
      validateUpstreamTarget("http://localhost:11434/v1", { allowLoopback: true }),
    ).toMatchObject({ ok: true });
    expect(
      validateUpstreamTarget("http://localhost:11434/v1", { allowLoopback: false }),
    ).toMatchObject({ ok: false });
  });

  it("reports an unreachable endpoint as 502 without leaking the URL or key", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const result = await relayCompatibleRequest(relayRequest({ body: "{}" }), "/v1/models", {
      fetchImpl,
    });

    expect(result).toMatchObject({ ok: false, status: 502 });
    const message = (result as { message: string }).message;
    expect(message).not.toContain("api.example.com");
    expect(message).not.toContain("user-key");
  });

  it("preserves the upstream status and body so client error mapping still works", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        okJson({ error: { code: "invalid_api_key", message: "Invalid API key." } }, 401),
      );
    const result = await relayCompatibleRequest(relayRequest({ body: "{}" }), "/v1/models", {
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.status).toBe(401);
    expect(await result.response.text()).toContain("invalid_api_key");
  });

  it("does not forward cookies or CORS headers from the upstream", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: {
          "set-cookie": "leak=1",
          "access-control-allow-origin": "*",
          "content-type": "application/json",
        },
      }),
    );
    const result = await relayCompatibleRequest(relayRequest({ body: "{}" }), "/v1/models", {
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.headers.get("set-cookie")).toBeNull();
    expect(result.response.headers.get("access-control-allow-origin")).toBeNull();
    expect(result.response.headers.get("content-type")).toBe("application/json");
  });

  it("streams an SSE body without buffering it", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
      );

    const result = await relayCompatibleRequest(
      relayRequest({ body: "{}" }),
      "/v1/chat/completions",
      {
        fetchImpl,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.headers.get("content-type")).toBe("text/event-stream");
    const text = await result.response.text();
    expect(text).toContain('"content":"Hi"');
    expect(text).toContain("[DONE]");
  });

  it("forwards the request body unchanged", async () => {
    const payload = { model: "m", messages: [{ role: "user", content: "hi" }], stream: true };
    const fetchImpl = vi.fn().mockResolvedValue(okJson({}));
    await relayCompatibleRequest(
      relayRequest({ body: JSON.stringify(payload) }),
      "/v1/chat/completions",
      {
        fetchImpl,
      },
    );

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(ReadableStream);
  });
});

describe("isBlockedHost", () => {
  it.each([
    "localhost",
    "my.localhost",
    "0.0.0.0",
    "::1",
    "[::1]",
    "something.local",
    "service.internal",
    "10.1.2.3",
    "127.0.0.1",
    "172.20.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "fd00::1",
    "fe80::1",
  ])("blocks %s", (host) => {
    expect(isBlockedHost(host)).toBe(true);
  });

  it.each(["api.openai.com", "100milionseek.top", "8.8.8.8", "1.1.1.1", "example.com"])(
    "allows %s",
    (host) => {
      expect(isBlockedHost(host)).toBe(false);
    },
  );
});
