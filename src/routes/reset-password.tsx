import { createFileRoute } from "@tanstack/react-router";

import { AuthPage } from "@/features/auth/AuthPage";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — Markdown Workspace" }] }),
  component: () => <AuthPage mode="reset" />,
});
