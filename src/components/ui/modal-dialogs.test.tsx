import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./confirm-dialog";
import { PromptDialog } from "./prompt-dialog";

describe("ConfirmDialog", () => {
  it("calls onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete item"
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete item");
    expect(dialog).toHaveTextContent("This cannot be undone.");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not call onConfirm when canceled", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete item"
        description="This cannot be undone."
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("PromptDialog", () => {
  it("submits trimmed text and closes the modal", () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <PromptDialog
        open
        onOpenChange={onOpenChange}
        title="Rename document"
        label="Document name"
        defaultValue="Draft"
        submitLabel="Rename"
        onSubmit={onSubmit}
      />,
    );

    const input = screen.getByLabelText("Document name") as HTMLInputElement;
    expect(input.value).toBe("Draft");

    fireEvent.change(input, { target: { value: "  Final Notes  " } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSubmit).toHaveBeenCalledWith("Final Notes");
  });

  it("disables submission when the input is blank", () => {
    const onSubmit = vi.fn();
    render(
      <PromptDialog
        open
        onOpenChange={vi.fn()}
        title="New folder"
        label="Folder name"
        submitLabel="Create"
        onSubmit={onSubmit}
      />,
    );

    const submitButton = screen.getByRole("button", { name: "Create" });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Folder name"), { target: { value: "   " } });
    expect(submitButton).toBeDisabled();

    fireEvent.submit(submitButton.closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
