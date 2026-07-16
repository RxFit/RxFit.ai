import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // The app's vite.config uses @vitejs/plugin-react for the automatic JSX
  // runtime; mirror that here so .tsx component tests compile without a
  // manual React import.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client", "src"),
    },
  },
  test: {
    include: [
      "server/**/*.test.ts",
      "shared/**/*.test.ts",
      "script/**/*.test.ts",
      "scripts/**/*.test.ts",
      "client/src/**/*.test.ts",
      // .tsx component tests (e.g. AdminPage.test.tsx) opt into jsdom via a
      // per-file "@vitest-environment jsdom" docblock; default stays node.
      "client/src/**/*.test.tsx",
    ],
    environment: "node",
  },
});
