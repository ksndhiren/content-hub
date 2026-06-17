// @lovable.dev/vite-tanstack-config already includes Cloudflare as the Nitro
// target — do NOT add tanstackStart, viteReact, tailwind, tsConfigPaths, nitro,
// or component tagger manually here, they're built in.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Force-enable the nitro deploy plugin. Without this the plugin skips nitro
  // unless it detects the Lovable sandbox, which means Cloudflare CI builds
  // produce a plain Vite dist/ instead of .output/public/_worker.js.
  nitro: { preset: "cloudflare-pages" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts.
    server: { entry: "server" },
  },
});
