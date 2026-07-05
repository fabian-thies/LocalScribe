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
        mkdirSync(resolve(__dirname, "dist"), { recursive: true });
        copyFileSync(resolve(__dirname, "manifest.json"), resolve(__dirname, "dist/manifest.json"));
        cpSync(resolve(__dirname, "icons"), resolve(__dirname, "dist/icons"), { recursive: true });
      }
    }
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/popup.html"),
        options: resolve(__dirname, "src/options/options.html"),
        history: resolve(__dirname, "src/pages/history.html"),
        detail: resolve(__dirname, "src/pages/detail.html"),
        offscreen: resolve(__dirname, "src/offscreen/offscreen.html"),
        liveAudioCaptureProcessor: resolve(__dirname, "src/offscreen/liveAudioCaptureProcessor.ts"),
        serviceWorker: resolve(__dirname, "src/background/serviceWorker.ts")
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
