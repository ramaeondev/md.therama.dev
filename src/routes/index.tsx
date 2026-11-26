import { createFileRoute } from "@tanstack/react-router";

import { AboutPage } from "./about";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Markdown AI Workspace — Local-first Markdown" },
      {
        name: "description",
        content:
          "A private, local-first Markdown workspace for writing, organizing, and optionally using your own AI provider.",
      },
      { property: "og:title", content: "Markdown AI Workspace" },
      {
        property: "og:description",
        content: "A local-first Markdown workspace. Your notes stay in this browser; AI is optional.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AboutPage,
});
