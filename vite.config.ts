import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Default to relative paths for normal deployments.
  // When embedding under a sub-path, set EMBED_BASE_PATH (e.g. /tuyen-sinh/embed/mbti-career-neu/).
  base: (process.env.EMBED_BASE_PATH ?? "./").replace(/\/?$/, "/"),
  plugins: [react(), tailwindcss()],
  
  // Define environment variables để inline vào code
  define: {
    __VITE_API_BASE__: JSON.stringify(
      process.env.VITE_API_BASE || "https://ai.neu.edu.vn/tuyen-sinh/api/apps/mbti-career-neu"
    ),
    __VITE_AI_BASE__: JSON.stringify(
      process.env.VITE_AI_BASE || "https://mbti-career-neu.vercel.app/"
    ),
  },
  
  server: {
    port: 3001,
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
      "/health": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
  build: {
    outDir: process.env.BUILD_OUT_DIR ?? "dist",
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});