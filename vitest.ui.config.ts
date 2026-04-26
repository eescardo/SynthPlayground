import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/ui/**/*.test.ts"],
    fileParallelism: false
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
});
