import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "child_process";

// Helper to get git hash
const getGitHash = () => {
  try {
    // 1. Vercel
    if (process.env.VERCEL_GIT_COMMIT_SHA) {
      return process.env.VERCEL_GIT_COMMIT_SHA;
    }
    // 2. GitHub Actions
    if (process.env.GITHUB_SHA) {
      return process.env.GITHUB_SHA;
    }
    // 3. Local Git
    return execSync("git rev-parse HEAD").toString().trim();
  } catch (e) {
    console.warn("Could not resolve git commit hash", e);
    return "dev";
  }
};

const commitHash = getGitHash().substring(0, 7);

// Allow overrides via env vars for 2025 deployment flexibility
const VITE_PORT = Number(process.env.VITE_PORT || process.env.PORT || 3001);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"), // Pointing directly to root src
    },
  },
  root: "./", // Entry point is now in the project root
  build: {
    outDir: "dist", // Standard output directory at root
    emptyOutDir: true,
  },
  server: {
    port: VITE_PORT,
    strictPort: true,
  },
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
});
