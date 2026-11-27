import { fileURLToPath, URL } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Builds the front page into the site folder (../web): index.html plus its scripts and styles in web/landing/.
// The app's own files in web/ are left alone (emptyOutDir: false).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { outDir: "../web", emptyOutDir: false, assetsDir: "landing", sourcemap: false },
})
