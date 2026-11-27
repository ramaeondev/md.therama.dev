// Build configuration for TanStack Start on Vite.
//
// TanStack Start and React are registered as the framework plugins, Tailwind
// compiles styles, and nitro produces the server bundle for a build only.
// Never set ssr.external or resolve.external: the server bundle has no runtime
// module resolution, so the build fails. Never add compression
// (compressPublicAssets, vite-plugin-compression): hosting compresses at the edge.
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  // Resolve the "@/*" alias from tsconfig.json (Vite 8 native support).
  resolve: {
    tsconfigPaths: true,
    // Prevent duplicate copies of React and TanStack Query, which break hooks.
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Keep server-only modules out of the client bundle.
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    react(),
    ...(command === "build" ? [nitro({ preset: "cloudflare-module" })] : []),
  ],
}));
