import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
// the page's styles travel inside this one script file, so the front page needs just one file (the live site loads it
// from the site's Wix Media)
import css from "./index.css?inline"

const style = document.createElement("style")
style.textContent = css
document.head.append(style)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
