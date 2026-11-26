import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GuidedTour, type GuidedTourStep } from "./GuidedTour";

const steps: GuidedTourStep[] = [
  { target: "first", title: "First stop", description: "Intro" },
  { target: "second", title: "Second stop", description: "Storage", settingsSection: "storage" },
];

describe("GuidedTour", () => {
  beforeEach(() => window.localStorage.clear());

  it("moves through feature steps and announces the current section to the workspace", async () => {
    const onStepChange = vi.fn();
    render(<GuidedTour open onClose={vi.fn()} onStepChange={onStepChange} steps={steps} />);

    expect(await screen.findByRole("heading", { name: "First stop" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(await screen.findByRole("heading", { name: "Second stop" })).toBeInTheDocument();
    await waitFor(() => expect(onStepChange).toHaveBeenLastCalledWith(steps[1]));
  });

  it("supports back navigation and marks a finished tour as complete locally", async () => {
    const onClose = vi.fn();
    render(<GuidedTour open onClose={onClose} onStepChange={vi.fn()} steps={steps} />);
    fireEvent.click(await screen.findByRole("button", { name: /next/i }));
    fireEvent.click(await screen.findByRole("button", { name: /back/i }));
    expect(await screen.findByRole("heading", { name: "First stop" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /skip tour/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem("markdown-ai-workspace-tour-complete")).toBe("true");
  });

  it("does not render while closed", () => {
    render(<GuidedTour open={false} onClose={vi.fn()} onStepChange={vi.fn()} steps={steps} />);
    expect(screen.queryByTestId("guided-tour")).not.toBeInTheDocument();
  });
});
