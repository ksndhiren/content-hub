// @lovable.dev/vite-tanstack-config already includes Cloudflare as the Nitro
// target — do NOT add tanstackStart, viteReact, tailwind, tsConfigPaths, nitro,
// or component tagger manually here, they're built in.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts.
    server: { entry: "server" },
  },
});
