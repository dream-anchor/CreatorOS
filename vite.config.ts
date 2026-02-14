import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    headers: {
      // Zwingend erforderlich für FFmpeg WASM (SharedArrayBuffer)
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    // WICHTIG: Diese Pakete müssen von der Vite-Optimierung ausgeschlossen werden
    exclude: [
      "omniclip", 
      "@ffmpeg/ffmpeg", 
      "@ffmpeg/util", 
      "ffprobe-wasm",
      "@benev/toolbox" // Wegen Rapier Fehler
    ],
  },
  build: {
    target: "esnext", // Erlaubt Top-Level Await im Build
  },
  esbuild: {
    target: "esnext", // Erlaubt Top-Level Await im Dev-Server
  },
}));
