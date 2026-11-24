import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { clearAuthOnLaunch } from "./lib/pb";
import "./index.css";

// Constraint 7 / TC05: every fresh launch starts logged out, at /login.
clearAuthOnLaunch();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* HashRouter: routes work inside the Capacitor WebView (no server rewrites needed). */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
