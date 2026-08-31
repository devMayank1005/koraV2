import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(fileURLToPath(new URL(".", import.meta.url))) },
  },
  test: {
    // Default to node; component tests opt in with a
    // `// @vitest-environment jsdom` docblock at the top of the file
    // (environmentMatchGlobs was removed in Vitest 4).
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // bcrypt runs at cost 12 in the auth tests, by design — the dummy-hash
    // comparison that equalises login timing is genuinely expensive.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
