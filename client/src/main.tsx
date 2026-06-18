import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const container = document.getElementById("root")!;

// Prerendered routes ship server-rendered markup, so hydrate them. In dev (and
// any non-prerendered shell) the root only holds the `<!--app-html-->` comment
// placeholder, so mount fresh instead. childElementCount ignores comment/text
// nodes, distinguishing a real prerendered tree from the empty dev shell.
if (container.childElementCount > 0) {
  hydrateRoot(container, <App />);
} else {
  createRoot(container).render(<App />);
}
