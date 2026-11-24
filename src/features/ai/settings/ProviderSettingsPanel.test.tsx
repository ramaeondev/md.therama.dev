import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProviderSettingsPanel, type ProviderSettingsPanelProps } from "./ProviderSettingsPanel";

function baseProps(
  overrides: Partial<ProviderSettingsPanelProps> = {},
): ProviderSettingsPanelProps {
  return {
    connectedProviders: [],
    activeProviderId: null,
    selectedModels: {},
    customProviders: [],
    busyProviderId: null,
    statusByProvider: {},
    errorByProvider: {},
    onConnect: vi.fn().mockResolvedValue(true),
    onTest: vi.fn().mockResolvedValue(true),
    onDisconnect: vi.fn(),
    onSelectProvider: vi.fn(),
    onSelectModel: vi.fn(),
    onAddCustomProvider: vi.fn().mockResolvedValue(true),
    onRemoveCustomProvider: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const openAiModels = [
  {
    id: "gpt-4.1-mini",
    providerId: "openai",
    displayName: "GPT 4.1 Mini",
    source: "discovered" as const,
    availability: "available" as const,
    capabilities: { textGeneration: true, streaming: true },
  },
  {
    id: "some-new-model",
    providerId: "openai",
    displayName: "Some New Model",
    source: "discovered" as const,
    availability: "unknown" as const,
    capabilities: { textGeneration: false, streaming: false },
  },
];

async function typeKey(label: string, value: string) {
  const input = screen.getByLabelText(label);
  await act(async () => {
    fireEvent.change(input, { target: { value } });
  });
  return input;
}

describe("AI provider settings UI", () => {
  it("lists Gemini and OpenAI as independent provider cards", () => {
    render(<ProviderSettingsPanel {...baseProps()} />);
    expect(screen.getByRole("heading", { name: "Google Gemini" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "OpenAI" })).toBeInTheDocument();
    expect(screen.getByLabelText("Google Gemini API key")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("OpenAI API key")).toHaveAttribute("type", "password");
  });

  it("connects OpenAI with its own key and clears the field afterwards", async () => {
    const onConnect = vi.fn().mockResolvedValue(true);
    render(<ProviderSettingsPanel {...baseProps({ onConnect })} />);
    const input = await typeKey("OpenAI API key", "sk-live-value");

    await act(async () => {
      screen.getByRole("button", { name: "Connect OpenAI" }).click();
    });

    await waitFor(() => expect(onConnect).toHaveBeenCalledWith("openai", "sk-live-value"));
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("refuses to connect without a key and shows a validation message", async () => {
    const onConnect = vi.fn();
    render(<ProviderSettingsPanel {...baseProps({ onConnect })} />);
    await act(async () => {
      screen.getByRole("button", { name: "Connect OpenAI" }).click();
    });
    expect(onConnect).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter an API key to connect.");
  });

  it("shows both providers connected with the active one marked", () => {
    render(
      <ProviderSettingsPanel
        {...baseProps({
          connectedProviders: [
            {
              providerId: "gemini",
              displayName: "Google Gemini",
              models: [
                {
                  id: "gemini-test",
                  providerId: "gemini",
                  displayName: "Gemini Test",
                  source: "discovered",
                  availability: "available",
                  capabilities: { textGeneration: true, streaming: true },
                },
              ],
              connectedAt: "2026-11-24T10:00:00.000Z",
            },
            {
              providerId: "openai",
              displayName: "OpenAI",
              models: openAiModels,
              connectedAt: "2026-11-24T10:01:00.000Z",
            },
          ],
          activeProviderId: "openai",
          selectedModels: { openai: "gpt-4.1-mini" },
        })}
      />,
    );

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use provider" })).toBeInTheDocument();
  });

  it("selects a model from the discovered list", async () => {
    const onSelectModel = vi.fn();
    render(
      <ProviderSettingsPanel
        {...baseProps({
          connectedProviders: [
            {
              providerId: "openai",
              displayName: "OpenAI",
              models: openAiModels,
              connectedAt: "2026-11-24T10:01:00.000Z",
            },
          ],
          activeProviderId: "openai",
          selectedModels: { openai: "gpt-4.1-mini" },
          onSelectModel,
        })}
      />,
    );

    await act(async () => {
      screen.getByRole("button", { name: /Some New Model/ }).click();
    });
    expect(onSelectModel).toHaveBeenCalledWith("openai", "some-new-model");
  });

  it("does not present an unconfirmed model as chat-capable", () => {
    render(
      <ProviderSettingsPanel
        {...baseProps({
          connectedProviders: [
            {
              providerId: "openai",
              displayName: "OpenAI",
              models: openAiModels,
              connectedAt: "2026-11-24T10:01:00.000Z",
            },
          ],
          activeProviderId: "openai",
        })}
      />,
    );

    const unconfirmed = screen.getByRole("button", { name: /Some New Model/ });
    expect(unconfirmed).toHaveTextContent("untested");
    expect(screen.getByText(/not confirmed to support chat/)).toBeInTheDocument();
  });

  it("switches to another connected provider", async () => {
    const onSelectProvider = vi.fn();
    render(
      <ProviderSettingsPanel
        {...baseProps({
          connectedProviders: [
            {
              providerId: "gemini",
              displayName: "Google Gemini",
              models: [
                {
                  id: "gemini-test",
                  providerId: "gemini",
                  displayName: "Gemini Test",
                  source: "discovered",
                  availability: "available",
                  capabilities: { textGeneration: true, streaming: true },
                },
              ],
              connectedAt: "2026-11-24T10:00:00.000Z",
            },
            {
              providerId: "openai",
              displayName: "OpenAI",
              models: openAiModels,
              connectedAt: "2026-11-24T10:01:00.000Z",
            },
          ],
          activeProviderId: "openai",
          onSelectProvider,
        })}
      />,
    );

    await act(async () => {
      screen.getByRole("button", { name: "Use provider" }).click();
    });
    expect(onSelectProvider).toHaveBeenCalledWith("gemini");
  });

  it("disconnects one provider without touching the other", async () => {
    const onDisconnect = vi.fn();
    render(
      <ProviderSettingsPanel
        {...baseProps({
          connectedProviders: [
            {
              providerId: "gemini",
              displayName: "Google Gemini",
              models: [],
              connectedAt: "2026-11-24T10:00:00.000Z",
            },
            {
              providerId: "openai",
              displayName: "OpenAI",
              models: openAiModels,
              connectedAt: "2026-11-24T10:01:00.000Z",
            },
          ],
          activeProviderId: "gemini",
          onDisconnect,
        })}
      />,
    );

    const clearButtons = screen.getAllByRole("button", { name: "Clear key" });
    expect(clearButtons).toHaveLength(2);
    await act(async () => {
      clearButtons[1]?.click();
    });
    expect(onDisconnect).toHaveBeenCalledWith("openai");
  });

  it("surfaces a provider-specific error without leaking a key", () => {
    render(
      <ProviderSettingsPanel
        {...baseProps({
          statusByProvider: { openai: "failed" },
          errorByProvider: {
            openai: "The API key was rejected. Check the key and its API access.",
          },
        })}
      />,
    );

    expect(
      screen.getByText("The API key was rejected. Check the key and its API access."),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("sk-");
  });

  it("adds an OpenAI-compatible provider through the form", async () => {
    const onAddCustomProvider = vi.fn().mockResolvedValue(true);
    render(<ProviderSettingsPanel {...baseProps({ onAddCustomProvider })} />);

    await act(async () => {
      screen.getByRole("button", { name: /Add an OpenAI-compatible provider/ }).click();
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Compatible provider name"), {
        target: { value: "100milionseek" },
      });
      fireEvent.change(screen.getByLabelText("Compatible provider base URL"), {
        target: { value: "https://100milionseek.top/v1" },
      });
      fireEvent.change(screen.getByLabelText("Compatible provider API key"), {
        target: { value: "compatible-key" },
      });
    });
    await act(async () => {
      screen.getByRole("button", { name: /Add & connect/ }).click();
    });

    await waitFor(() =>
      expect(onAddCustomProvider).toHaveBeenCalledWith({
        displayName: "100milionseek",
        baseUrl: "https://100milionseek.top/v1",
        apiKey: "compatible-key",
      }),
    );
  });

  it("requires every field before adding a compatible provider", async () => {
    const onAddCustomProvider = vi.fn();
    render(<ProviderSettingsPanel {...baseProps({ onAddCustomProvider })} />);
    await act(async () => {
      screen.getByRole("button", { name: /Add an OpenAI-compatible provider/ }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: /Add & connect/ }).click();
    });
    expect(onAddCustomProvider).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Provider name, base URL, and API key are all required.",
    );
  });

  it("lists a saved compatible provider and can remove it after confirmation", async () => {
    const onRemoveCustomProvider = vi.fn().mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <ProviderSettingsPanel
        {...baseProps({
          customProviders: [
            {
              id: "openai-compatible:100milionseek",
              displayName: "100milionseek",
              baseUrl: "https://100milionseek.top/v1",
            },
          ],
          onRemoveCustomProvider,
        })}
      />,
    );

    expect(screen.getByRole("heading", { name: "100milionseek" })).toBeInTheDocument();
    await act(async () => {
      screen.getByRole("button", { name: "Remove 100milionseek" }).click();
    });
    expect(onRemoveCustomProvider).toHaveBeenCalledWith("openai-compatible:100milionseek");
    confirmSpy.mockRestore();
  });
});
