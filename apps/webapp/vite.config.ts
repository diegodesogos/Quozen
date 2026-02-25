import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "child_process";
import tsconfigPaths from "vite-tsconfig-paths";

const getGitHash = () => {
  try {
    if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
    if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
    return execSync("git rev-parse HEAD").toString().trim();
  } catch (e) {
    return "dev";
  }
};

const commitHash = getGitHash().substring(0, 7);
const VITE_PORT = Number(process.env.VITE_PORT || process.env.PORT || 3001);

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  root: "./",
  envDir: "../../",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Advanced manual chunks logic
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // Separate Routing from React Core
            if (id.includes("react-router") || id.includes("@remix-run")) {
              return "react-routing";
            }
            if (id.includes("react") || id.includes("react-dom")) {
              return "react-framework";
            }
            // 2. Data Visualization & Heavy Motion (the "heavy hitters")
            if (id.includes("recharts") || id.includes("framer-motion") || id.includes("d3")) {
              return "viz";
            }
            // 3. UI Primitives (Radix and icons)
            if (id.includes("@radix-ui") || id.includes("lucide-react") || id.includes("react-icons")) {
              return "ui-primitives";
            }
            // 4. Fallback for all other dependencies
            return "vendor";
          }
        },
      },
    },
  },
  server: {
    port: VITE_PORT,
    strictPort: true,
  },
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
});