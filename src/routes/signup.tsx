import { createFileRoute } from "@tanstack/react-router";

import { AuthPage } from "@/features/auth/AuthPage";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account — Markdown Workspace" }] }),
  component: () => <AuthPage mode="signup" />,
});
