import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

function legalNotices() {
  return {
    name: "hoby-legal-notices",
    async closeBundle() {
      await Promise.all([
        copyFile(resolve(import.meta.dirname, "LICENSE"), resolve(import.meta.dirname, "dist/LICENSE")),
        copyFile(
          resolve(import.meta.dirname, "THIRD_PARTY_NOTICES.md"),
          resolve(import.meta.dirname, "dist/THIRD_PARTY_NOTICES.md"),
        ),
      ]);
    },
  };
}

export default defineConfig({
  plugins: [react(), legalNotices()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(import.meta.dirname, "src/background.ts"),
        newtab: resolve(import.meta.dirname, "newtab.html"),
        popup: resolve(import.meta.dirname, "popup.html"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
      },
    },
  },
  test: {
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "tests/e2e/**", "scripts/tests/**"],
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/main.tsx",
        "src/**/*.d.ts",
        "src/background.ts",
        "src/app/**",
        "src/ui/Button.tsx",
        "src/ui/EmptyState.tsx",
        "src/ui/Icon.tsx",
        "src/ui/LoadingScreen.tsx",
        "src/ui/Logo.tsx",
        "src/ui/Toast.tsx",
      ],
      thresholds: {
        lines: 72,
        functions: 65,
        branches: 58,
        statements: 70,
        "src/domain/**": {
          lines: 85,
          functions: 85,
          branches: 70,
          statements: 85,
        },
        "src/platform/**": {
          lines: 65,
          functions: 60,
          branches: 50,
          statements: 65,
        },
        "src/newtab/**": {
          lines: 50,
          functions: 45,
          branches: 45,
          statements: 50,
        },
        "src/popup/**": {
          lines: 85,
          functions: 85,
          branches: 65,
          statements: 80,
        },
      }
    }
  }
});
