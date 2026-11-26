import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OpenSourceBadge, StarOnGitHubButton } from "./OpenSourceBadge";
import { OpenSourceSection } from "./OpenSourceSection";
import { MCP_PACKAGE, REPOSITORY } from "./repository";

describe("open-source details", () => {
  it("points the repository and npm package at the published locations", () => {
    expect(REPOSITORY.slug).toBe("ramaeondev/md.therama.dev");
    expect(REPOSITORY.url).toBe("https://github.com/ramaeondev/md.therama.dev");
    expect(REPOSITORY.license).toBe("MIT");
    expect(MCP_PACKAGE.name).toBe("@ramaeon/md-workspace-mcp");
    expect(MCP_PACKAGE.url).toBe("https://www.npmjs.com/package/@ramaeon/md-workspace-mcp");
  });

  it("links the badge to the repository and names the licence", () => {
    render(<OpenSourceBadge />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", REPOSITORY.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("Open source");
    expect(link).toHaveTextContent("MIT");
  });

  it("exposes a Star on GitHub call to action", () => {
    render(<StarOnGitHubButton />);
    expect(screen.getByRole("link")).toHaveAttribute("href", REPOSITORY.url);
    expect(screen.getByText(/Star on GitHub/)).toBeInTheDocument();
  });

  it("shows the repository, npm package, and licence in the showcase section", () => {
    render(<OpenSourceSection />);

    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain(REPOSITORY.url);
    expect(hrefs).toContain(REPOSITORY.issuesUrl);
    expect(hrefs).toContain(REPOSITORY.licenseUrl);
    expect(hrefs).toContain(MCP_PACKAGE.url);

    expect(screen.getByText(REPOSITORY.slug)).toBeInTheDocument();
    expect(screen.getByText(MCP_PACKAGE.name)).toBeInTheDocument();
  });
});
