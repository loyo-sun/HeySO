import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {sourceRevision} from "./scripts/source-revision.mjs";
export default defineConfig({
  define: { __HEYSO_COMMIT__: JSON.stringify(sourceRevision()) },
  plugins: [react()],
  server: { host: "127.0.0.1" },
  build: { outDir: "dist" },
});
