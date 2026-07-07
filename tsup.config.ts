import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "bin/ai-codeview": "src/bin/ai-codeview.ts",
  },
  format: ["esm"],
  target: "node20",
  clean: true,
  sourcemap: true,
  dts: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
