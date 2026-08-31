import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    // Default to node; component tests opt in with a
    // `// @vitest-environment jsdom` docblock at the top of the file
    // (environmentMatchGlobs was removed in Vitest 4).
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
