import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  define: { __HEYSO_COMMIT__: JSON.stringify(process.env.COMMIT_REF || process.env.GITHUB_SHA || "") },
  plugins: [react()],
  server: { host: "127.0.0.1" },
  build: { outDir: "dist" },
});
