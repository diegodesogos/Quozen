import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Defaults (keep your original defaults here)
const DEFAULT_VITE_PORT = 3001;    // defaul Vite frontend port
const DEFAULT_BACKEND_PORT = 5001; // proxy target default
// Allow overrides via env vars. Use process.env.PORT as fallback for some platforms.
const VITE_PORT = Number(process.env.VITE_PORT || process.env.PORT || DEFAULT_VITE_PORT);
const BACKEND_PORT = Number(process.env.BACKEND_PORT || process.env.SERVER_PORT || DEFAULT_BACKEND_PORT);


export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  root: path.resolve(__dirname, "client"),
  envDir: "../",
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
  server: {
    port: VITE_PORT,
  },
});
