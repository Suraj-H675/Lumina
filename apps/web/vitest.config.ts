import { defineConfig } from "vitest/config";

// Component tests exercise React's development build (with act support).
// Some development shells export NODE_ENV=production globally, which makes
// React resolve its production bundle and breaks @testing-library/react.
// CI does not set NODE_ENV, so this only normalizes hostile local shells.
process.env.NODE_ENV = "test";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
  },
});
