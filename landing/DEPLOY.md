# Front page on the live site

`npx vite build` (from this folder) writes `web/index.html` and one script, `web/landing/landing.js`, with the page's
styles inside it. The page loads it as a plain deferred script; if it can't be loaded, the page opens the app.

Wix Media does not accept `.js` files, so on the live site the script is uploaded to the site's Media as a text file
(`levelup-landing-<n>.txt`, served as `text/plain` with CORS, which browsers run as a classic script), and the live
`index.html` points at it:

```bash
LANDING_JS_URL="https://<site-id>.usrfiles.com/ugd/<file>.txt" npx vite build
```

Current live script: `https://ae69fefd-a3dd-4c66-806c-8e4282a5a22f.usrfiles.com/ugd/5ca763_0c7d36f54e0749f5bd237334d15a3f1e.txt`
(`levelup-landing-1.txt`, identical to `web/landing/landing.js` at the commit that added this note). When the front page
changes: build, upload the new `landing.js` to Media as a new `.txt` (Media API generate-upload-url, then PUT), build
again with its address, and upload `index.html` to the site. Rebuild without `LANDING_JS_URL` before committing, so
the repository's page keeps using its local copy.

# The app's sidebar on the live site

`npx vite build -c vite.shell.config.ts` builds the app's sidebar (the "Dashboard Sidebar" component from 21st.dev,
`src/components/ui/dashboard-sidebar.tsx`, filled in by `src/app-shell.tsx`) to `web/shell/levelup-shell.js`. The
repository's `web/app.html` loads that local copy (the Windows app uses it too). On the live site it is in the site's
Media as `levelup-shell-1.txt` and the live `app.html` points at it:
`https://ae69fefd-a3dd-4c66-806c-8e4282a5a22f.usrfiles.com/ugd/5ca763_a537cd42b1f24143851f2424dea53ace.txt`
(identical to `web/shell/levelup-shell.js` at the commit that added this note). The offline helper keeps a copy of
Media files like it, so the sidebar also works offline. When the sidebar changes, upload the new build to Media as a
new `.txt` and point the live `app.html` at its new address.
