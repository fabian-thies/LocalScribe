import { resolve } from "node:path";
import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "copy-extension-manifest",
      closeBundle() {
        mkdirSync(resolve(import.meta.dirname, "dist"), { recursive: true });
        copyFileSync(resolve(import.meta.dirname, "manifest.json"), resolve(import.meta.dirname, "dist/manifest.json"));
        cpSync(resolve(import.meta.dirname, "icons"), resolve(import.meta.dirname, "dist/icons"), { recursive: true });
      }
    }
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, "src/popup/popup.html"),
        options: resolve(import.meta.dirname, "src/options/options.html"),
        history: resolve(import.meta.dirname, "src/pages/history.html"),
        detail: resolve(import.meta.dirname, "src/pages/detail.html"),
        offscreen: resolve(import.meta.dirname, "src/offscreen/offscreen.html"),
        liveAudioCaptureProcessor: resolve(import.meta.dirname, "src/offscreen/liveAudioCaptureProcessor.ts"),
        serviceWorker: resolve(import.meta.dirname, "src/background/serviceWorker.ts")
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
