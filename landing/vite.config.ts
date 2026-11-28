import { fileURLToPath, URL } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

// Builds the front page into the site folder (../web): index.html plus its scripts and styles in web/landing/.
// The app's own files in web/ are left alone (emptyOutDir: false).
// The page loads the script as a plain deferred script (not a module), so it also runs when served as text from
// Wix Media. LANDING_JS_URL sets where it comes from (the live site's Media address); by default the local copy.
// If it can't be loaded, the page opens the app instead of staying blank.
function classicScript(): Plugin {
  return {
    name: "levelup-classic-script",
    enforce: "post",
    transformIndexHtml(html) {
      const src = process.env.LANDING_JS_URL || "./landing/landing.js"
      return html.replace(/<script type="module" crossorigin src="[^"]*landing\.js"><\/script>/,
        `<script defer src="${src}" onerror="location.replace('app.html')"></script>`)
    },
  }
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), classicScript()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // one classic script (no modules, styles inside) at a fixed name: the live site serves it from its Wix Media
  build: {
    outDir: "../web", emptyOutDir: false, assetsDir: "landing", sourcemap: false, modulePreload: false, cssCodeSplit: false,
    rollupOptions: { output: { format: "iife", inlineDynamicImports: true, entryFileNames: "landing/landing.js" } },
  },
})
