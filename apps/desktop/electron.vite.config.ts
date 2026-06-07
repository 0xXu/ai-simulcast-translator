import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin, loadEnv } from "electron-vite";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  // Load .env from the monorepo root (two levels up from apps/desktop)
  const repoRoot = resolve(__dirname, "../..");
  const env = loadEnv(mode, repoRoot, "");

  // Variables consumed by the main process at runtime via process.env
  const mainEnvDefines: Record<string, string> = {};
  const mainEnvKeys = [
    "WHISPER_MODEL",
    "WHISPER_DEVICE",
    "WHISPER_COMPUTE_TYPE",
    "MIMO_API_KEY",
    "MIMO_BASE_URL",
    "MIMO_API_BASE_URL",
    "MIMO_MODEL",
  ];
  for (const key of mainEnvKeys) {
    if (env[key] !== undefined) {
      mainEnvDefines[`process.env.${key}`] = JSON.stringify(env[key]);
    }
  }

  return {
    main: {
      plugins: [
        externalizeDepsPlugin({
          exclude: [
            "@simulcast/application",
            "@simulcast/contracts",
            "@simulcast/domain",
            "@simulcast/infrastructure",
          ],
        }),
      ],
      define: mainEnvDefines,
    },
    preload: {
      plugins: [
        externalizeDepsPlugin({
          exclude: ["@simulcast/contracts"],
        }),
      ],
      build: {
        rollupOptions: {
          output: {
            format: "cjs",
            entryFileNames: "[name].js",
          },
        },
      },
    },
    renderer: {
      plugins: [react()],
    },
  };
});
