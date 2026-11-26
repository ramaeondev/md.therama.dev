import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SiteFooter } from "./SiteFooter";
import { getSocialLinks } from "./staticApi";

const SOCIAL_ROWS = [
  {
    id: "1",
    platform: "github",
    url: "https://github.com/ramaeon",
    display_name: "GitHub",
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "2",
    platform: "unknown-network",
    url: "https://example.test/me",
    display_name: "Other",
    created_at: "2025-01-01T00:00:00Z",
  },
];

function mockFetch(handler: () => unknown) {
  const fetchMock = vi.fn(async () => {
    const body = handler();
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderFooter = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SiteFooter />
    </QueryClientProvider>,
  );
};

describe("SiteFooter", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("reads social links from the shared static schema with the publishable key", async () => {
    const fetchMock = mockFetch(() => SOCIAL_ROWS);

    await expect(getSocialLinks()).resolves.toEqual([
      {
        id: "1",
        platform: "github",
        url: "https://github.com/ramaeon",
        label: "GitHub",
        created_at: "2025-01-01T00:00:00Z",
      },
      {
        id: "2",
        platform: "unknown-network",
        url: "https://example.test/me",
        label: "Other",
        created_at: "2025-01-01T00:00:00Z",
      },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/rest/v1/social_links?");
    expect(url).toContain("is_active=eq.true");
    const headers = init.headers as Record<string, string>;
    expect(headers["Accept-Profile"]).toBe("static");
    expect(headers["apikey"]).toMatch(/^sb_publishable_/);
  });

  it("renders the project credit and only the social platforms it knows", async () => {
    mockFetch(() => SOCIAL_ROWS);
    renderFooter();

    expect(screen.getByText("Markdown AI Workspace")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "therama.dev" })).toHaveAttribute(
      "href",
      "https://therama.dev",
    );
    expect(await screen.findByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/ramaeon",
    );
    expect(screen.queryByRole("link", { name: "Other" })).not.toBeInTheDocument();
  });

  it("renders the credit without social buttons when the API fails", async () => {
    mockFetch(() => new Error("offline"));
    renderFooter();

    expect(screen.getByText("Markdown AI Workspace")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "GitHub" })).not.toBeInTheDocument();
  });
});
