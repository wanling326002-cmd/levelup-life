// Builds the app's sidebar (src/app-shell.tsx) as one plain script, web/shell/levelup-shell.js, with its styles inside.
// app.html loads it; the rest of the app stays plain JavaScript.
import { fileURLToPath, URL } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "../web/shell",
    emptyOutDir: false,
    sourcemap: false,
    cssCodeSplit: false,
    lib: { entry: "src/app-shell.tsx", formats: ["iife"], name: "LevelUpShell", fileName: () => "levelup-shell.js" },
  },
})
