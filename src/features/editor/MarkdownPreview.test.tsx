import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownPreview } from "./MarkdownPreview";

describe("Markdown preview headings", () => {
  it("assigns stable anchor IDs from rendered heading text", () => {
    render(
      <MarkdownPreview
        content={"# A workspace that stays yours\n\n## Notes in **plain text**"}
      />,
    );

    expect(screen.getByRole("heading", { name: "A workspace that stays yours" })).toHaveAttribute(
      "id",
      "a-workspace-that-stays-yours",
    );
    expect(screen.getByRole("heading", { name: "Notes in plain text" })).toHaveAttribute(
      "id",
      "notes-in-plain-text",
    );
  });
});
