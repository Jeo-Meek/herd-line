import { defineConfig } from "vite";

export default defineConfig({
  base: "/herd-line/",
  server: {
    host: true,
    port: 5173,
    open: "/herd-line/",
  },
  preview: {
    host: true,
    port: 4173,
    open: "/herd-line/",
  },
  build: {
    target: "es2022",
    sourcemap: true,
    assetsInlineLimit: 0,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
