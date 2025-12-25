import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

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
});
