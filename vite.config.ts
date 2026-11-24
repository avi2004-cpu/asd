import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset paths so the build also works inside the Capacitor WebView.
  base: "./",
  server: { host: true, port: 5173 },
});
